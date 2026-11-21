using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Security;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using Microsoft.CSharp.RuntimeBinder;
using Microsoft.Win32;

namespace PulseCleanup
{
    internal sealed partial class WindowsIntegration
    {
        private const string ProfilesCategory = "Профили Windows";
        private const string StartupCategory = "Автозапуск";
        private const string UninstallCategory = "Записи удаления";
        private const string ShortcutCategory = "Ярлыки";
        private const string CurrentVersion = @"Software\Microsoft\Windows\CurrentVersion\";
        private const string UninstallPath = CurrentVersion + "Uninstall";
        private const string ProfileListPath = @"Software\Microsoft\Windows NT\CurrentVersion\ProfileList";
        private const string ProductKey = "exepcstudio.Pulse";

        private sealed class Profile
        {
            internal string Sid, Root, Roaming, Local;
            internal bool Current, Loaded;
        }

        private sealed class RegistryLocation
        {
            internal RegistryHive Hive;
            internal RegistryView View;
            internal Profile Profile;

            internal RegistryKey Open()
            {
                return RegistryKey.OpenBaseKey(Hive, View);
            }

            internal string Key(string path)
            {
                return Hive == RegistryHive.Users ? Profile.Sid + @"\" + path : path;
            }

            internal string Label(string path)
            {
                string root = Hive == RegistryHive.LocalMachine ? "HKLM"
                    : Hive == RegistryHive.CurrentUser ? "HKCU" : "HKU";
                return root + @"\" + Key(path) + " [" + View + "]";
            }
        }

        private readonly List<Action<CleanupPlan, CleanupReport>> candidates =
            new List<Action<CleanupPlan, CleanupReport>>();
        private List<Profile> profiles;

        internal IEnumerable<string> DiscoverProfileRoots(CleanupReport report)
        {
            return Profiles(report).Select(profile => profile.Root).Where(root => root != null)
                .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }

        internal void DiscoverImages(Action<string> addImage, CleanupReport report)
        {
            candidates.Clear();
            var lookedAt = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            Action<string> consider = path =>
            {
                if (path != null && lookedAt.Add(path) && CandidateImage(path)) addImage(path);
            };
            foreach (Profile profile in Profiles(report))
            {
                string installImage = Under(profile.Local, @"Programs\Pulse\Pulse.exe");
                if (installImage != null) consider(installImage);
            }
            foreach (RegistryLocation location in RegistryLocations(report))
            {
                foreach (string name in new[] { "Run", "RunOnce" })
                    ReadAutorun(location, CurrentVersion + name, consider, report);
                ReadUninstall(location, consider, report);
            }
            ReadShortcuts(consider, report);
            ReadTasks(consider, report);
            ReadServices(consider, report);
            ReadProcessImages(consider, report);
        }

        private static bool CandidateImage(string path)
        {
            if (Recognizable(Path.GetFileName(path))) return true;
            try
            {
                // Metadata only selects candidates, including unchanged binaries with new names.
                using (PinnedPath file = SafePath.Open(path, false, false))
                {
                    FileVersionInfo info = FileVersionInfo.GetVersionInfo(file.Path);
                    return (Same(info.OriginalFilename, "Pulse.exe") && Same(info.ProductName, "Pulse")
                        && Same(info.CompanyName, "exepcstudio"))
                        || (Same(info.OriginalFilename, "Pulse-Update.exe") && Same(info.ProductName, "Pulse Updater"));
                }
            }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                return false;
            }
        }

        internal void Discover(CleanupPlan plan, CleanupReport report)
        {
            foreach (Action<CleanupPlan, CleanupReport> candidate in candidates)
                candidate(plan, report);
            PreviewProcesses(plan, report);
        }

        internal void Apply(CleanupPlan plan, CleanupReport report)
        {
            foreach (IntegrationItem item in plan.Integrations)
                item.Apply(report);
            StopProcesses(plan, report);
        }

        private void Collect(Action<string> addImage, string category, string label, IEnumerable<string> hints,
            IEnumerable<string> possibleProof, bool recognizable,
            Action<CleanupPlan, string, CleanupReport> remove)
        {
            foreach (string image in hints.Where(path => path != null).Distinct(StringComparer.OrdinalIgnoreCase))
                addImage(image);
            string[] proof = possibleProof.Where(path => path != null)
                .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            candidates.Add((plan, report) =>
            {
                string image = proof.FirstOrDefault(plan.ContainsImage);
                if (image == null)
                {
                    if (recognizable)
                        report.Unchecked(category, label, "Нет прямой цели с подтверждённой принадлежностью Pulse.");
                    return;
                }
                plan.Integrations.Add(new IntegrationItem(category, label, "Проверенная цель: " + image, result =>
                    ApplyReference(plan, result, category, label, proof.Where(plan.ContainsImage),
                        () => remove(plan, image, result))));
            });
        }

        private static void ApplyReference(CleanupPlan plan, CleanupReport report, string category, string label,
            IEnumerable<string> images, Action apply)
        {
            int before = report.Lines.Count();
            try { apply(); }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                report.Failed(category, label, error);
                if (AccessDenied(error)) report.ElevationMayHelp();
            }
            if (report.Lines.Skip(before).Any(row => row.Status == "remaining" || row.Status == "unchecked"))
                foreach (string image in images) plan.BlockImage(image);
        }

        private List<Profile> Profiles(CleanupReport report)
        {
            if (profiles != null)
                return profiles;

            var bySid = new Dictionary<string, Profile>(StringComparer.OrdinalIgnoreCase);
            string currentSid;
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
                currentSid = identity.User.Value;
            bySid[currentSid] = new Profile
            {
                Sid = currentSid,
                Root = SafePath.Normalize(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)),
                Roaming = SafePath.Normalize(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)),
                Local = SafePath.Normalize(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)),
                Current = true,
                Loaded = true
            };

            Inspect(report, ProfilesCategory, "HKLM\\ProfileList", () =>
            {
                using (RegistryKey system = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, NativeView))
                using (RegistryKey list = system.OpenSubKey(ProfileListPath))
                {
                    if (list == null)
                    {
                        report.Unchecked(ProfilesCategory, "HKLM\\ProfileList", "Список профилей отсутствует.");
                        return;
                    }
                    foreach (string sid in list.GetSubKeyNames().Where(UserSid))
                    {
                        if (bySid.ContainsKey(sid))
                            continue;
                        Inspect(report, ProfilesCategory, sid, () =>
                        {
                            using (RegistryKey entry = list.OpenSubKey(sid))
                            {
                                string raw = ReadValue(entry, "ProfileImagePath");
                                string root = SafePath.Normalize(Expand(raw, null));
                                if (root == null)
                                    report.Unchecked(ProfilesCategory, sid, "Путь профиля не подтверждён как локальный.");
                                bySid.Add(sid, new Profile { Sid = sid, Root = root,
                                    Roaming = Under(root, @"AppData\Roaming"), Local = Under(root, @"AppData\Local") });
                            }
                        });
                    }
                }
            });
            Inspect(report, ProfilesCategory, "HKEY_USERS", () =>
            {
                using (RegistryKey users = RegistryKey.OpenBaseKey(RegistryHive.Users, NativeView))
                {
                    foreach (string sid in users.GetSubKeyNames().Where(UserSid))
                    {
                        Profile profile;
                        if (!bySid.TryGetValue(sid, out profile))
                        {
                            profile = new Profile { Sid = sid };
                            bySid.Add(sid, profile);
                            report.Unchecked(ProfilesCategory, sid, "У загруженного профиля нет подтверждённого локального каталога.");
                        }
                        profile.Loaded = true;
                    }
                }
            });
            foreach (Profile profile in bySid.Values)
            {
                if (!profile.Loaded)
                    report.Unchecked(ProfilesCategory, profile.Root ?? profile.Sid,
                        "Пользовательский реестр не загружен. Доступные файлы профиля проверяются отдельно.");
                else if (!profile.Current)
                {
                    profile.Roaming = RedirectedFolder(profile, "AppData", profile.Roaming, report);
                    profile.Local = RedirectedFolder(profile, "Local AppData", profile.Local, report);
                }
            }
            profiles = bySid.Values.ToList();
            return profiles;
        }

        private static bool UserSid(string name)
        {
            // The machine also exposes services, .DEFAULT, and SID_Classes under HKEY_USERS.
            if (!(name.StartsWith("S-1-5-21-", StringComparison.OrdinalIgnoreCase)
                || name.StartsWith("S-1-12-1-", StringComparison.OrdinalIgnoreCase)))
                return false;
            try { return Same(new SecurityIdentifier(name).Value, name); }
            catch (ArgumentException) { return false; }
        }

        private static RegistryView NativeView
        {
            get { return Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Registry32; }
        }

        private IEnumerable<RegistryLocation> RegistryLocations(CleanupReport report)
        {
            RegistryView[] views = Environment.Is64BitOperatingSystem
                ? new[] { RegistryView.Registry64, RegistryView.Registry32 }
                : new[] { RegistryView.Registry32 };
            foreach (RegistryView view in views)
            {
                yield return new RegistryLocation { Hive = RegistryHive.LocalMachine, View = view };
                foreach (Profile profile in Profiles(report).Where(profile => profile.Loaded))
                {
                    if (!profile.Current)
                        yield return new RegistryLocation { Hive = RegistryHive.Users, View = view, Profile = profile };
                    else
                        yield return new RegistryLocation { Hive = RegistryHive.CurrentUser, View = view, Profile = profile };
                }
            }
        }

        private void ReadAutorun(RegistryLocation location, string path, Action<string> addImage, CleanupReport report)
        {
            string keyLabel = location.Label(path);
            Inspect(report, StartupCategory, keyLabel, () =>
            {
                using (RegistryKey root = location.Open())
                using (RegistryKey key = root.OpenSubKey(location.Key(path)))
                {
                    if (key == null) return;
                    foreach (string name in key.GetValueNames())
                    {
                        string label = keyLabel + " / " + name;
                        string value = ReadValue(key, name);
                        string image = DirectCommandImage(value, location.Profile);
                        if (image == null && !Recognizable(name)) continue;
                        Collect(addImage, StartupCategory, label, new[] { image }, new[] { image }, Recognizable(name),
                            (plan, proof, result) => RemoveAutorun(location, path, name, value, plan, proof, label, result));
                    }
                }
            });
        }

        private static void RemoveAutorun(RegistryLocation location, string path, string name, string expected,
            CleanupPlan plan, string image, string label, CleanupReport report)
        {
            using (RegistryKey root = location.Open())
            using (RegistryKey key = root.OpenSubKey(location.Key(path), true))
            {
                if (key == null) return;
                object current = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                if (current == null) return;
                string live = current as string;
                using (PinnedPath verified = PinProof(plan, image))
                {
                    if (verified == null || !string.Equals(live, expected, StringComparison.Ordinal)
                        || !Same(DirectCommandImage(live, location.Profile), image)
                        || !string.Equals(ReadValue(key, name), live, StringComparison.Ordinal))
                    {
                        report.Remaining(StartupCategory, label, "Запись или подтверждённый бинарник изменились после проверки.");
                        return;
                    }
                    key.DeleteValue(name, false);
                    if (key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) == null)
                        report.Added(StartupCategory, label, "Запись удалена.");
                    else
                        report.Remaining(StartupCategory, label, "Запись появилась снова после удаления.");
                }
            }
        }

        private static readonly string[] UninstallFields =
        {
            "Publisher", "DisplayName", "InstallLocation", "DisplayIcon", "UninstallString", "QuietUninstallString"
        };

        private void ReadUninstall(RegistryLocation location, Action<string> addImage, CleanupReport report)
        {
            string keyLabel = location.Label(UninstallPath);
            Inspect(report, UninstallCategory, keyLabel, () =>
            {
                using (RegistryKey root = location.Open())
                using (RegistryKey key = root.OpenSubKey(location.Key(UninstallPath)))
                {
                    if (key == null) return;
                    foreach (string name in key.GetSubKeyNames())
                    {
                        string label = keyLabel + @"\" + name;
                        Inspect(report, UninstallCategory, label, () =>
                        {
                            string[] fields;
                            using (RegistryKey entry = key.OpenSubKey(name))
                            {
                                if (entry == null) return;
                                fields = UninstallFields.Select(field => ReadValue(entry, field)).ToArray();
                            }
                            string directory = DirectPath(Expand(fields[2], location.Profile));
                            string installed = Under(directory, "Pulse.exe");
                            string icon = DisplayIconImage(Expand(fields[3], location.Profile));
                            string uninstall = DirectCommandImage(fields[4], location.Profile);
                            string quiet = DirectCommandImage(fields[5], location.Profile);
                            string[] direct = { uninstall, quiet };
                            bool registration = Same(name, ProductKey)
                                || (Same(fields[0], "exepcstudio") && Recognizable(fields[1]));
                            string[] siblings = direct.Where(path => path != null)
                                .Select(path => Under(Path.GetDirectoryName(path), "Pulse.exe")).ToArray();
                            string[] hints = new[] { installed, icon }.Concat(direct).Concat(siblings).ToArray();
                            IEnumerable<string> proof = registration ? hints : direct;
                            Collect(addImage, UninstallCategory, label, hints, proof, registration,
                                (plan, image, result) => RemoveUninstall(location, name, fields, plan, image, label, result));
                        });
                    }
                }
            });
        }

        private static void RemoveUninstall(RegistryLocation location, string name, string[] expected, CleanupPlan plan,
            string image, string label, CleanupReport report)
        {
            using (RegistryKey root = location.Open())
            using (RegistryKey key = root.OpenSubKey(location.Key(UninstallPath), true))
            {
                if (key == null) return;
                using (PinnedPath verified = PinProof(plan, image))
                {
                    using (RegistryKey entry = key.OpenSubKey(name))
                    {
                        if (entry == null) return;
                        if (verified == null || !expected.SequenceEqual(UninstallFields.Select(field => ReadValue(entry, field)))
                            || entry.SubKeyCount != 0)
                        {
                            report.Remaining(UninstallCategory, label, "Запись или цель изменились либо в записи есть вложенные ключи.");
                            return;
                        }
                        key.DeleteSubKey(name, false);
                    }
                    using (RegistryKey live = key.OpenSubKey(name))
                    {
                        if (live == null)
                            report.Added(UninstallCategory, label, "Запись удалена.");
                        else
                            report.Remaining(UninstallCategory, label, "Запись появилась снова после удаления.");
                    }
                }
            }
        }

        private void ReadShortcuts(Action<string> addImage, CleanupReport report)
        {
            var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (Profile profile in Profiles(report))
            {
                var folders = new[]
                {
                    new { Name = "Desktop", Field = Environment.SpecialFolder.DesktopDirectory,
                        Default = Under(profile.Root, "Desktop"), Tree = false },
                    new { Name = "Startup", Field = Environment.SpecialFolder.Startup,
                        Default = Under(profile.Roaming, @"Microsoft\Windows\Start Menu\Programs\Startup"), Tree = true },
                    new { Name = "Programs", Field = Environment.SpecialFolder.Programs,
                        Default = Under(profile.Roaming, @"Microsoft\Windows\Start Menu\Programs"), Tree = true }
                };
                foreach (var folder in folders)
                {
                    string path = folder.Default;
                    if (profile.Current)
                        path = LocalKnownFolder(folder.Field, path, report);
                    else if (profile.Loaded)
                        path = RedirectedFolder(profile, folder.Name, path, report);
                    bool startup = folder.Field == Environment.SpecialFolder.Startup;
                    ScanShortcutFolder(path, folder.Tree, startup, profile, visited, addImage, report);
                    if (!Same(path, folder.Default))
                        ScanShortcutFolder(folder.Default, folder.Tree, startup, profile, visited, addImage, report);
                }
            }
            foreach (Environment.SpecialFolder field in new[] { Environment.SpecialFolder.CommonDesktopDirectory,
                Environment.SpecialFolder.CommonStartup, Environment.SpecialFolder.CommonPrograms })
            {
                string path = LocalKnownFolder(field, null, report);
                ScanShortcutFolder(path, field != Environment.SpecialFolder.CommonDesktopDirectory,
                    field == Environment.SpecialFolder.CommonStartup, null, visited, addImage, report);
            }
        }

        private static string LocalKnownFolder(Environment.SpecialFolder field, string fallback, CleanupReport report)
        {
            string raw = Environment.GetFolderPath(field);
            string path = SafePath.Normalize(raw);
            if (path == null && !string.IsNullOrEmpty(raw))
                report.Unchecked(ShortcutCategory, field.ToString(), "Перенаправленный системный каталог находится вне локальной области.");
            return path ?? fallback;
        }

        private static string RedirectedFolder(Profile profile, string name, string fallback, CleanupReport report)
        {
            string result = fallback;
            string keyPath = profile.Sid + @"\" + CurrentVersion + @"Explorer\User Shell Folders";
            Inspect(report, ShortcutCategory, "HKU\\" + keyPath + " / " + name, () =>
            {
                using (RegistryKey root = RegistryKey.OpenBaseKey(RegistryHive.Users, NativeView))
                using (RegistryKey key = root.OpenSubKey(keyPath))
                {
                    string value = ReadValue(key, name);
                    if (value == null) return;
                    string path = DirectPath(Expand(value, profile));
                    if (path == null)
                        report.Unchecked(ShortcutCategory, profile.Root ?? profile.Sid, "Перенаправленный каталог " + name + " находится вне локальной области.");
                    else
                        result = path;
                }
            });
            return result;
        }

        private void ScanShortcutFolder(string path, bool tree, bool startup, Profile profile, HashSet<string> visited,
            Action<string> addImage, CleanupReport report)
        {
            if (path == null || !visited.Add(path)) return;
            int visitedCount = 0;
            var pending = new Stack<string>();
            pending.Push(path);
            while (pending.Count != 0)
            {
                string directory = pending.Pop();
                if (++visitedCount > 4096)
                {
                    report.Unchecked(ShortcutCategory, path, "Достигнут предел обхода каталогов меню и автозапуска.");
                    return;
                }
                Inspect(report, ShortcutCategory, directory, () =>
                {
                    using (PinnedPath pin = SafePath.Open(directory, true, false))
                    {
                        foreach (DirectoryEntry entry in pin.Entries(10000))
                        {
                            if (!SafePath.IsSafeName(entry.Name))
                            {
                                if (tree && entry.Directory)
                                    report.Unchecked(ShortcutCategory, pin.Path, "Вложенный каталог с неподдерживаемым именем пропущен.");
                                continue;
                            }
                            bool shortcut = !entry.Directory && Same(Path.GetExtension(entry.Name), ".lnk");
                            if (entry.Reparse)
                            {
                                if (shortcut || (tree && entry.Directory))
                                    report.Unchecked(ShortcutCategory, Path.Combine(pin.Path, entry.Name), "Перенаправленный объект пропущен.");
                                continue;
                            }
                            string child = Under(pin.Path, entry.Name);
                            if (child == null) continue;
                            if (entry.Directory)
                            {
                                if (tree && visited.Add(child)) pending.Push(child);
                            }
                            else if (shortcut)
                                ReadShortcut(child, profile, addImage, report);
                            else if (startup && Same(directory, path) && Same(Path.GetExtension(entry.Name), ".exe"))
                                addImage(child);
                        }
                    }
                });
            }
        }

        private void ReadShortcut(string path, Profile profile, Action<string> addImage, CleanupReport report)
        {
            Inspect(report, ShortcutCategory, path, () =>
            {
                using (PinnedPath link = SafePath.Open(path, false, false))
                {
                    string image = ShortcutImage(link.Path, profile);
                    bool recognizable = Recognizable(Path.GetFileNameWithoutExtension(path));
                    if (image == null && !recognizable) return;
                    string digest = image == null ? null : link.Sha256();
                    FileStamp stamp = link.Stamp;
                    Collect(addImage, ShortcutCategory, path, new[] { image }, new[] { image }, recognizable,
                        (plan, proof, result) =>
                        {
                            using (PinnedPath verified = PinProof(plan, proof))
                            using (PinnedPath live = OpenIfPresent(path, false, true))
                            {
                                if (live == null) return;
                                if (verified == null || !stamp.Equals(live.Stamp) || !Same(live.Sha256(), digest))
                                {
                                    result.Remaining(ShortcutCategory, path, "Ярлык или подтверждённый бинарник изменились после проверки.");
                                    return;
                                }
                                live.Delete();
                            }
                            using (PinnedPath check = OpenIfPresent(path, false, false))
                            {
                                if (check == null)
                                    result.Added(ShortcutCategory, path, "Ярлык удалён.");
                                else
                                    result.Remaining(ShortcutCategory, path, "Ярлык снова обнаружен после удаления.");
                            }
                        });
                }
            });
        }

        private static string ShortcutImage(string path, Profile profile)
        {
            Type type = Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046"), true);
            object shellLink = Activator.CreateInstance(type);
            try
            {
                // STGM_READ, and GetPath(SLGP_RAWPATH). Never resolve or run a shortcut.
                ((IPersistFile)shellLink).Load(path, 0);
                var buffer = new StringBuilder(32768);
                int status = ((ShellLinkPath)shellLink).GetPath(buffer, buffer.Capacity, IntPtr.Zero, 4);
                if (status < 0) Marshal.ThrowExceptionForHR(status);
                return status == 0 ? ExePath(Expand(buffer.ToString(), profile)) : null;
            }
            finally { ReleaseCom(shellLink); }
        }

        [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
        private interface ShellLinkPath
        {
            [PreserveSig]
            int GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int capacity, IntPtr findData, uint flags);
        }

        private static string ReadValue(RegistryKey key, string name)
        {
            return key == null ? null : key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
        }

        private static string Under(string directory, string leaf)
        {
            return directory == null ? null : SafePath.Normalize(Path.Combine(directory, leaf));
        }

        private static string Expand(string raw, Profile profile)
        {
            if (raw == null) return null;
            bool unknown = false;
            string result = Regex.Replace(raw, "%([^%]+)%", match =>
            {
                string name = match.Groups[1].Value.ToUpperInvariant();
                string value = null;
                if (profile != null)
                {
                    if (name == "USERPROFILE") value = profile.Root;
                    if (name == "APPDATA") value = profile.Roaming;
                    if (name == "LOCALAPPDATA") value = profile.Local;
                    if (name == "HOMEDRIVE" && profile.Root != null) value = profile.Root.Substring(0, 2);
                    if (name == "HOMEPATH" && profile.Root != null) value = profile.Root.Substring(2);
                }
                switch (name)
                {
                    case "SYSTEMROOT":
                    case "WINDIR":
                    case "SYSTEMDRIVE":
                    case "PROGRAMFILES":
                    case "PROGRAMFILES(X86)":
                    case "PROGRAMW6432":
                    case "COMMONPROGRAMFILES":
                    case "COMMONPROGRAMFILES(X86)":
                    case "COMMONPROGRAMW6432":
                    case "PROGRAMDATA":
                    case "ALLUSERSPROFILE":
                        value = Environment.GetEnvironmentVariable(name);
                        break;
                }
                unknown |= value == null;
                return value ?? match.Value;
            }, RegexOptions.CultureInvariant);
            return unknown ? null : result;
        }

        internal static string DirectCommandImage(string command)
        {
            return DirectCommandImage(command, null);
        }

        private static string DirectCommandImage(string command, Profile profile)
        {
            if (string.IsNullOrWhiteSpace(command)) return null;
            command = command.TrimStart(' ', '\t');
            if (command[0] == '"')
            {
                int close = command.IndexOf('"', 1);
                if (close == -1 || (close + 1 < command.Length && !CommandSeparator(command[close + 1]))) return null;
                return ExePath(Expand(command.Substring(1, close - 1), profile));
            }
            int length = 0;
            while (length < command.Length && !CommandSeparator(command[length])) length++;
            string path = Expand(command.Substring(0, length), profile);
            return path != null && !path.Any(CommandSeparator) ? ExePath(path) : null;
        }

        private static bool CommandSeparator(char character)
        {
            return character == ' ' || character == '\t';
        }

        internal static string DisplayIconImage(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;
            int comma = text.LastIndexOf(',');
            if (comma < 0) return ExePath(text);
            int index;
            return int.TryParse(text.Substring(comma + 1), NumberStyles.Integer, CultureInfo.InvariantCulture, out index)
                ? ExePath(text.Substring(0, comma)) : ExePath(text);
        }

        private static string DirectPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return null;
            path = path.Trim();
            if (path.Length >= 2 && path[0] == '"' && path[path.Length - 1] == '"')
                path = path.Substring(1, path.Length - 2);
            return path.IndexOf('"') < 0 ? SafePath.Normalize(path) : null;
        }

        private static string ExePath(string path)
        {
            if (path == null || path.TrimEnd(' ', '"').EndsWith("\\", StringComparison.Ordinal)
                || path.TrimEnd(' ', '"').EndsWith("/", StringComparison.Ordinal)) return null;
            string direct = DirectPath(path);
            return direct != null && Same(Path.GetExtension(direct), ".exe") ? direct : null;
        }

        private static bool Recognizable(string name)
        {
            return Same(name, ProductKey) || Same(name, "Pulse") || Same(name, "Pulse.exe")
                || Same(name, "Pulse Updater") || Same(name, "Pulse-Update") || Same(name, "Pulse-Update.exe")
                || Same(name, "Pulse-Update-2") || Same(name, "Pulse-Update-2.exe");
        }

        private static bool Same(string left, string right)
        {
            return string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
        }

        private static bool Recoverable(Exception error)
        {
            return error is IOException || error is UnauthorizedAccessException || error is SecurityException
                || error is COMException || error is Win32Exception || error is ManagementException
                || error is RuntimeBinderException || error is InvalidOperationException || error is ArgumentException
                || error is XmlException;
        }

        private static bool AccessDenied(Exception error)
        {
            var native = error as Win32Exception;
            var com = error as COMException;
            return error is UnauthorizedAccessException || error is SecurityException
                || (native != null && native.NativeErrorCode == 5)
                || (com != null && com.ErrorCode == unchecked((int)0x80070005));
        }

        private static void Inspect(CleanupReport report, string category, string label, Action read)
        {
            try { read(); }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                if (SafePath.IsMissing(error)) return;
                report.Unchecked(category, label, error.Message);
                if (AccessDenied(error)) report.ElevationMayHelp();
            }
        }

        private static PinnedPath PinProof(CleanupPlan plan, string image)
        {
            try { return plan.PinImage(image); }
            catch (Exception error)
            {
                if (SafePath.IsMissing(error)) return null;
                throw;
            }
        }

        private static PinnedPath OpenIfPresent(string path, bool directory, bool deleteAccess)
        {
            try { return SafePath.Open(path, directory, deleteAccess); }
            catch (Exception error)
            {
                if (SafePath.IsMissing(error)) return null;
                throw;
            }
        }

        private static void ReleaseCom(object value)
        {
            if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value);
        }
    }
}
