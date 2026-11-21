using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace PulseCleanup
{
    internal sealed partial class WindowsIntegration
    {
        private const string ProcessCategory = "Процессы";
        private const string BrowserImageName = "msedgewebview2.exe";
        private const uint QueryImage = 0x1000;
        private const uint Synchronize = 0x100000;
        private const uint Terminate = 0x0001;

        internal sealed class ObservedProcess
        {
            internal int Id, Parent, Session;
            internal long Created;
            internal string Name, Image;
            internal bool Browser;

            internal string Label
            {
                get { return (Image ?? Name) + " (PID " + Id.ToString(CultureInfo.InvariantCulture) + ")"; }
            }
        }

        private sealed class BrowserRelation
        {
            internal ObservedProcess Browser, BrowserRoot, Owner;
            internal string Profile;
        }

        private sealed class LiveProcess : IDisposable
        {
            internal ObservedProcess Record;
            internal KernelHandle Handle;
            internal PinnedPath Image;

            public void Dispose()
            {
                if (Handle != null) Handle.Dispose();
                if (Image != null) Image.Dispose();
            }
        }

        private Dictionary<int, ObservedProcess> preview;
        private readonly Dictionary<int, BrowserRelation> ownerHistory = new Dictionary<int, BrowserRelation>();
        private readonly int selfPid = CurrentPid();

        private void ReadProcessImages(Action<string> addImage, CleanupReport report)
        {
            ownerHistory.Clear();
            preview = ProcessSnapshot(report);
            if (preview == null) return;
            foreach (ObservedProcess row in preview.Values)
                if (row.Id != selfPid && row.Image != null && !Same(row.Name, BrowserImageName))
                    addImage(row.Image);
        }

        private void PreviewProcesses(CleanupPlan plan, CleanupReport report)
        {
            if (preview == null) return;
            ReportInaccessible(preview, plan, report);
            HashSet<int> owners = RootProcesses(preview, plan, null);
            RememberChildren(preview, owners);
            Dictionary<int, string> profiles = ReadBrowserProfiles(preview, plan, report);
            foreach (ObservedProcess row in preview.Values)
            {
                bool root = owners.Contains(row.Id);
                if (!root && !IsRememberedChild(row)) continue;
                if (!root && !CanCloseBrowser(row, preview, profiles, plan)) continue;
                string proof = root ? "Подтверждённый образ " + row.Image
                    : "WebView2 в дереве подтверждённого процесса " + ownerHistory[row.Id].Owner.Image;
                // The process phase uses a fresh snapshot after startup integrations are removed.
                plan.Integrations.Add(new IntegrationItem(ProcessCategory, row.Label, proof, result => { }));
            }
        }

        private void StopProcesses(CleanupPlan plan, CleanupReport report)
        {
            for (int attempt = 0; attempt < 3; attempt++)
            {
                Dictionary<int, ObservedProcess> snapshot = ProcessSnapshot(report);
                if (snapshot == null)
                {
                    foreach (string image in plan.Images) plan.BlockImage(image);
                    return;
                }
                HashSet<int> roots = RootProcesses(snapshot, plan, null);
                RememberChildren(snapshot, roots);
                Dictionary<int, string> profiles = ReadBrowserProfiles(snapshot, plan, report);
                ObservedProcess[] processes = snapshot.Values.Where(row => roots.Contains(row.Id)).ToArray();
                ObservedProcess[] webviews = snapshot.Values.Where(IsRememberedChild)
                    .OrderByDescending(row => row.Created).ToArray();
                if (processes.Length == 0 && webviews.Length == 0)
                    break;

                CloseAndObserveChildren(processes, webviews, snapshot, profiles, plan, report);
            }

            Dictionary<int, ObservedProcess> remaining = ProcessSnapshot(report);
            if (remaining == null)
            {
                foreach (string image in plan.Images) plan.BlockImage(image);
                return;
            }
            ReportInaccessible(remaining, plan, report);
            HashSet<int> stillRoots = RootProcesses(remaining, plan, report);
            RememberChildren(remaining, stillRoots);
            Dictionary<int, string> remainingProfiles = ReadBrowserProfiles(remaining, plan, report);
            var surviving = new HashSet<int>();
            foreach (ObservedProcess row in remaining.Values)
            {
                if (stillRoots.Contains(row.Id))
                    plan.BlockImage(row.Image);
                else if (IsRememberedChild(row))
                {
                    BrowserRelation relation = ownerHistory[row.Id];
                    plan.BlockImage(relation.Owner.Image);
                    if (!CanCloseBrowser(row, remaining, remainingProfiles, plan)
                        || !ProfileStillPrivate(relation.Profile, plan))
                    {
                        report.Unchecked(ProcessCategory, row.Label, "Профиль WebView2 используется совместно или принадлежность Pulse не подтверждена.");
                        report.RestartMayHelp();
                        continue;
                    }
                }
                else
                    continue;
                surviving.Add(row.Id);
                report.Remaining(ProcessCategory, row.Label, "Подтверждённый процесс ещё работает или запустился снова.");
                report.RestartMayHelp();
            }
            CheckDetachedProfiles(remaining, remainingProfiles, surviving, plan, report);
        }

        private HashSet<int> RootProcesses(Dictionary<int, ObservedProcess> snapshot, CleanupPlan plan,
            CleanupReport finalReport)
        {
            var confirmed = new HashSet<int>();
            foreach (var group in snapshot.Values.Where(row => row.Id != selfPid && row.Image != null
                && row.Created > 0 && plan.ContainsImage(row.Image)).GroupBy(row => row.Image, StringComparer.OrdinalIgnoreCase))
            {
                try
                {
                    using (PinnedPath image = PinProof(plan, group.Key))
                    {
                        if (image != null)
                        {
                            foreach (ObservedProcess row in group)
                            {
                                if (ImageAtLaunch(image.Stamp, row.Created)) confirmed.Add(row.Id);
                                else if (finalReport != null)
                                {
                                    plan.BlockImage(group.Key);
                                    finalReport.Unchecked(ProcessCategory, row.Label,
                                        "Файл образа создан или изменён после запуска процесса.");
                                }
                            }
                            continue;
                        }
                    }
                    if (finalReport != null)
                        finalReport.Remaining(ProcessCategory, group.Key, "Образ процесса изменился после предварительной проверки.");
                }
                catch (Exception error)
                {
                    if (!Recoverable(error)) throw;
                    if (finalReport != null) finalReport.Failed(ProcessCategory, group.Key, error);
                }
                if (finalReport != null) plan.BlockImage(group.Key);
            }
            return confirmed;
        }

        private void RememberChildren(Dictionary<int, ObservedProcess> snapshot, HashSet<int> roots)
        {
            foreach (ObservedProcess row in snapshot.Values.Where(row => row.Browser && row.Id != selfPid))
            {
                ObservedProcess browserRoot;
                ObservedProcess owner = BrowserOwner(row, snapshot, roots, out browserRoot);
                if (owner == null) continue;
                BrowserRelation previous;
                string profile = ownerHistory.TryGetValue(row.Id, out previous) && SameProcess(previous.Browser, row)
                    && SameProcess(previous.BrowserRoot, browserRoot) ? previous.Profile : null;
                ownerHistory[row.Id] = new BrowserRelation { Browser = row, BrowserRoot = browserRoot, Owner = owner, Profile = profile };
            }
        }

        private bool IsRememberedChild(ObservedProcess row)
        {
            BrowserRelation remembered;
            return row.Browser && row.Id != selfPid && ownerHistory.TryGetValue(row.Id, out remembered)
                && SameProcess(row, remembered.Browser);
        }

        internal static bool IsBrowserChild(ObservedProcess row, IDictionary<int, ObservedProcess> snapshot, ISet<int> roots)
        {
            ObservedProcess browserRoot;
            return BrowserOwner(row, snapshot, roots, out browserRoot) != null;
        }

        private static ObservedProcess BrowserOwner(ObservedProcess row, IDictionary<int, ObservedProcess> snapshot,
            ISet<int> roots, out ObservedProcess browserRoot)
        {
            browserRoot = null;
            ObservedProcess current = row;
            while (current.Browser)
            {
                ObservedProcess parent;
                if (!snapshot.TryGetValue(current.Parent, out parent) || parent.Id == current.Id
                    || parent.Created <= 0 || parent.Created >= current.Created || parent.Session != current.Session
                    || parent.Session < 0)
                    return null;
                if (roots.Contains(parent.Id))
                {
                    browserRoot = current;
                    return parent;
                }
                current = parent;
            }
            return null;
        }

        private bool CanCloseBrowser(ObservedProcess browser, Dictionary<int, ObservedProcess> snapshot,
            Dictionary<int, string> profiles, CleanupPlan plan)
        {
            BrowserRelation relation = ownerHistory[browser.Id];
            ObservedProcess liveRoot;
            if (snapshot.TryGetValue(relation.BrowserRoot.Id, out liveRoot) && SameProcess(liveRoot, relation.BrowserRoot))
            {
                string profile;
                relation.Profile = profiles.TryGetValue(liveRoot.Id, out profile) ? profile : null;
            }
            return relation.Profile != null && plan.ContainsWebView(relation.Profile)
                && !profiles.Any(pair => Same(pair.Value, relation.Profile) && !IsRememberedChild(snapshot[pair.Key]));
        }

        internal static bool ImageAtLaunch(FileStamp stamp, long processCreated)
        {
            return stamp.Created > 0 && stamp.Written > 0 && stamp.Created <= processCreated && stamp.Written <= processCreated;
        }

        private static bool SameProcess(ObservedProcess first, ObservedProcess second)
        {
            return first.Id == second.Id && first.Created > 0 && first.Created == second.Created
                && first.Session == second.Session && first.Image != null && Same(first.Image, second.Image);
        }

        private void CloseAndObserveChildren(ObservedProcess[] processes, ObservedProcess[] children,
            Dictionary<int, ObservedProcess> snapshot, Dictionary<int, string> profiles,
            CleanupPlan plan, CleanupReport report)
        {
            var watched = new List<LiveProcess>();
            try
            {
                foreach (ObservedProcess child in children)
                {
                    LiveProcess live = TryOpenLive(child, plan, ownerHistory[child.Id].Owner, report);
                    if (live != null) watched.Add(live);
                }

                // Keep verified handles across shutdown. A child can exit before it can be opened again.
                CloseGroup(processes, plan, true, report);
                WaitForGroup(watched, 350);
                var exited = new HashSet<int>();
                foreach (LiveProcess child in watched)
                    if (ReportObservedBrowserExit(child.Record, WaitForSingleObject(child.Handle, 0), report))
                        exited.Add(child.Record.Id);

                CloseGroup(children.Where(row => !exited.Contains(row.Id)
                    && CanCloseBrowser(row, snapshot, profiles, plan)), plan, false, report);
            }
            finally
            {
                foreach (LiveProcess child in watched) child.Dispose();
            }
        }

        internal static bool ReportObservedBrowserExit(ObservedProcess child, uint waitResult, CleanupReport report)
        {
            if (!child.Browser || waitResult != 0) return false;
            report.Added(ProcessCategory, child.Label, "Завершение дочернего WebView2 подтверждено во время очистки.");
            return true;
        }

        private void CloseGroup(IEnumerable<ObservedProcess> rows, CleanupPlan plan, bool graceful, CleanupReport report)
        {
            var live = new List<LiveProcess>();
            var checkedProfiles = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (ObservedProcess row in rows)
                {
                    ObservedProcess owner = row;
                    if (row.Browser)
                    {
                        BrowserRelation relation = ownerHistory[row.Id];
                        owner = relation.Owner;
                        bool privateProfile;
                        if (relation.Profile == null) continue;
                        if (!checkedProfiles.TryGetValue(relation.Profile, out privateProfile))
                        {
                            privateProfile = ProfileStillPrivate(relation.Profile, plan);
                            checkedProfiles.Add(relation.Profile, privateProfile);
                        }
                        if (!privateProfile) continue;
                    }
                    LiveProcess process = TryOpenLive(row, plan, owner, report);
                    if (process != null) live.Add(process);
                }
                if (graceful)
                {
                    foreach (LiveProcess process in live)
                        RequestWindowClose(process);
                    WaitForGroup(live, 1250);
                }
                else
                    WaitForGroup(live, 350);

                foreach (LiveProcess process in live)
                {
                    if (!Running(process.Handle))
                    {
                        report.Added(ProcessCategory, process.Record.Label,
                            graceful ? "Процесс завершился после запроса закрытия." : "Дочерний процесс завершился.");
                        continue;
                    }
                    if (ForceClose(process, report))
                        report.Added(ProcessCategory, process.Record.Label, "Процесс завершён принудительно после повторной проверки.");
                }
            }
            finally
            {
                foreach (LiveProcess process in live) process.Dispose();
            }
        }

        private static bool ProfileStillPrivate(string path, CleanupPlan plan)
        {
            if (path == null || !plan.ContainsWebView(path)) return false;
            foreach (DataWork data in plan.Installs.SelectMany(install => install.Data).Where(data => Same(data.WebView, path)))
            {
                try { return ProductFiles.ProfileStillSuitable(data, new CleanupReport()); }
                catch (Exception error)
                {
                    if (!Recoverable(error)) throw;
                    return false;
                }
            }
            return false;
        }

        private static LiveProcess TryOpenLive(ObservedProcess row, CleanupPlan plan, ObservedProcess owner, CleanupReport report)
        {
            var process = new LiveProcess { Record = row };
            bool keep = false;
            try
            {
                process.Handle = OpenProcess(QueryImage | Synchronize, false, row.Id);
                if (process.Handle.IsInvalid)
                {
                    if (Marshal.GetLastWin32Error() == 5) report.ElevationMayHelp();
                    return null;
                }
                if (!Running(process.Handle) || !SameProcess(row, Identify(process.Handle, row.Id, row.Parent, row.Name)))
                    return null;
                process.Image = PinProof(plan, owner.Image);
                if (process.Image == null || !ImageAtLaunch(process.Image.Stamp, owner.Created)) return null;
                if (row.Browser)
                {
                    using (PinnedPath runtime = TryReadBrowser(row.Image))
                        if (runtime == null || !ImageAtLaunch(runtime.Stamp, row.Created) || !IsBrowserExecutable(runtime.Path)) return null;
                }
                keep = true;
                return keep ? process : null;
            }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                if (AccessDenied(error)) report.ElevationMayHelp();
                return null;
            }
            finally
            {
                if (!keep) process.Dispose();
            }
        }

        private static bool ForceClose(LiveProcess entry, CleanupReport report)
        {
            ObservedProcess row = entry.Record;
            using (KernelHandle process = OpenProcess(QueryImage | Synchronize | Terminate, false, row.Id))
            {
                if (process.IsInvalid)
                {
                    if (Marshal.GetLastWin32Error() == 5) report.ElevationMayHelp();
                    return false;
                }
                if (!Running(process) || !SameProcess(row, Identify(process, row.Id, row.Parent, row.Name))) return false;
                using (PinnedPath runtime = row.Browser ? TryReadBrowser(row.Image) : null)
                {
                    if (row.Browser && (runtime == null || !ImageAtLaunch(runtime.Stamp, row.Created)
                        || !IsBrowserExecutable(runtime.Path))) return false;
                    if (!TerminateProcess(process, 1))
                    {
                        if (Marshal.GetLastWin32Error() == 5) report.ElevationMayHelp();
                        return false;
                    }
                    return WaitForSingleObject(process, 1000) == 0;
                }
            }
        }

        private static void RequestWindowClose(LiveProcess entry)
        {
            if (!Running(entry.Handle)) return;
            try
            {
                // The verified native handle is held across CloseMainWindow and any forced stop.
                using (Process process = Process.GetProcessById(entry.Record.Id))
                    process.CloseMainWindow();
            }
            catch (ArgumentException) { }
            catch (InvalidOperationException) { }
            catch (Win32Exception) { }
        }

        private static void WaitForGroup(IEnumerable<LiveProcess> processes, int milliseconds)
        {
            var elapsed = Stopwatch.StartNew();
            foreach (LiveProcess process in processes)
            {
                int remaining = milliseconds - (int)elapsed.ElapsedMilliseconds;
                if (remaining <= 0) return;
                WaitForSingleObject(process.Handle, (uint)remaining);
            }
        }

        private static bool Running(KernelHandle process)
        {
            // Only WAIT_OBJECT_0 proves the observed process has exited.
            return WaitForSingleObject(process, 0) != 0;
        }

        private static int CurrentPid()
        {
            using (Process process = Process.GetCurrentProcess()) return process.Id;
        }

        private static Dictionary<int, ObservedProcess> ProcessSnapshot(CleanupReport report)
        {
            var rows = new Dictionary<int, ObservedProcess>();
            bool complete = false;
            Inspect(report, ProcessCategory, "Снимок процессов Windows", () =>
            {
                long snapshotTime = DateTime.UtcNow.ToFileTimeUtc();
                using (KernelHandle snapshot = CreateToolhelp32Snapshot(2, 0))
                {
                    if (snapshot.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
                    var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf(typeof(ProcessEntry)) };
                    if (!Process32First(snapshot, ref entry)) throw new Win32Exception(Marshal.GetLastWin32Error());
                    do
                    {
                        if (entry.Pid == 0) continue;
                        int id = (int)entry.Pid;
                        using (KernelHandle handle = OpenProcess(QueryImage, false, id))
                        {
                            ObservedProcess row = Identify(handle, id, (int)entry.Parent, entry.Executable);
                            if (row.Created > snapshotTime)
                            {
                                // The table entry may refer to an earlier process with this PID.
                                continue;
                            }
                            if (row.Image != null && !Same(Path.GetFileName(row.Image), entry.Executable))
                            {
                                // PID was reused or the image could not be matched to the snapshot row.
                                row.Created = 0;
                                row.Image = null;
                            }
                            if (row.Image != null && Same(row.Name, BrowserImageName))
                            {
                                using (PinnedPath pin = TryReadBrowser(row.Image))
                                    row.Browser = pin != null && ImageAtLaunch(pin.Stamp, row.Created) && IsBrowserExecutable(pin.Path);
                            }
                            rows[id] = row;
                        }
                    } while (Process32Next(snapshot, ref entry));
                    int code = Marshal.GetLastWin32Error();
                    if (code != 18) throw new Win32Exception(code);
                    complete = true;
                }
            });
            return complete ? rows : null;
        }

        private static ObservedProcess Identify(KernelHandle handle, int id, int parent, string name)
        {
            uint session;
            var row = new ObservedProcess { Id = id, Parent = parent, Name = name,
                Session = ProcessIdToSessionId((uint)id, out session) ? (int)session : -1 };
            if (handle.IsInvalid) return row;
            long started, exited, kernel, user;
            var image = new StringBuilder(32768);
            int capacity = image.Capacity;
            if (GetProcessTimes(handle, out started, out exited, out kernel, out user)
                && QueryFullProcessImageName(handle, 0, image, ref capacity))
            {
                row.Created = started;
                row.Image = SafePath.Normalize(image.ToString());
            }
            return row;
        }

        private static PinnedPath TryReadBrowser(string path)
        {
            try { return SafePath.OpenRuntimeImageEvidence(path); }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                return null;
            }
        }

        private static bool IsBrowserExecutable(string path)
        {
            try
            {
                FileVersionInfo version = FileVersionInfo.GetVersionInfo(path);
                return Same(version.OriginalFilename, BrowserImageName) && Same(version.CompanyName, "Microsoft Corporation")
                    && Same(version.ProductName, "Microsoft Edge WebView2");
            }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                return false;
            }
        }

        private static void ReportInaccessible(Dictionary<int, ObservedProcess> snapshot, CleanupPlan plan, CleanupReport report)
        {
            var names = new HashSet<string>(plan.Images.Select(Path.GetFileName), StringComparer.OrdinalIgnoreCase);
            foreach (ObservedProcess row in snapshot.Values.Where(row => row.Image == null))
            {
                if (Recognizable(row.Name) || names.Contains(row.Name))
                {
                    report.Unchecked(ProcessCategory, row.Label, "Не удалось прочитать путь и время запуска процесса.");
                    report.ElevationMayHelp();
                }
            }
        }

        private static Dictionary<int, string> ReadBrowserProfiles(Dictionary<int, ObservedProcess> snapshot,
            CleanupPlan plan, CleanupReport report)
        {
            var profiles = new Dictionary<int, string>();
            if (!plan.Images.Any() || !snapshot.Values.Any(row => row.Browser)) return profiles;
            Inspect(report, ProcessCategory, "Профили работающих WebView2", () =>
            {
                using (var search = new ManagementObjectSearcher(@"root\CIMV2",
                    "SELECT ProcessId, CreationDate, ExecutablePath, CommandLine FROM Win32_Process WHERE Name = 'msedgewebview2.exe'",
                    new EnumerationOptions { Rewindable = false, Timeout = TimeSpan.FromSeconds(4) }))
                using (ManagementObjectCollection rows = search.Get())
                {
                    foreach (ManagementObject row in rows)
                    using (row)
                    {
                        int id = Convert.ToInt32(row["ProcessId"], CultureInfo.InvariantCulture);
                        ObservedProcess known;
                        string timestamp = row["CreationDate"] as string;
                        if (!snapshot.TryGetValue(id, out known) || !known.Browser
                            || string.IsNullOrEmpty(timestamp) || !Same(known.Image, SafePath.Normalize(row["ExecutablePath"] as string))
                            || ManagementDateTimeConverter.ToDateTime(timestamp).ToUniversalTime().ToFileTimeUtc() / 10 != known.Created / 10)
                            continue;
                        string profile = RecognizedBrowserProfile(
                            FindArgument(row["CommandLine"] as string, "--user-data-dir="),
                            path => plan.ContainsWebView(path) || plan.ContainsDeferredWebView(path));
                        if (profile != null) profiles[id] = profile;
                    }
                }
            });
            return profiles;
        }

        internal static string RecognizedBrowserProfile(string argument, Func<string, bool> contains)
        {
            string path = DirectPath(argument);
            if (path == null) return null;
            if (contains(path)) return path;
            // The Chromium process can use the EBWebView directory inside the API's user-data folder.
            if (!Same(Path.GetFileName(path), "EBWebView")) return null;
            string parent = SafePath.Normalize(Path.GetDirectoryName(path));
            return parent != null && contains(parent) ? parent : null;
        }

        private void CheckDetachedProfiles(Dictionary<int, ObservedProcess> snapshot, Dictionary<int, string> profiles,
            HashSet<int> surviving, CleanupPlan plan, CleanupReport report)
        {
            foreach (var pair in profiles)
            {
                ObservedProcess row = snapshot[pair.Key];
                if (surviving.Contains(row.Id) || IsRememberedChild(row)) continue;
                plan.BlockWebView(pair.Value);
                report.Unchecked(ProcessCategory, row.Label,
                    "WebView2 использует запланированный профиль, но его родительская связь с Pulse не подтверждена.");
                report.RestartMayHelp();
            }
        }

        private static string FindArgument(string command, string name)
        {
            if (string.IsNullOrWhiteSpace(command)) return null;
            int count;
            IntPtr args = CommandLineToArgvW(command, out count);
            if (args == IntPtr.Zero) return null;
            try
            {
                for (int index = 1; index < count; index++)
                {
                    string argument = Marshal.PtrToStringUni(Marshal.ReadIntPtr(args, index * IntPtr.Size));
                    if (argument != null && argument.StartsWith(name, StringComparison.OrdinalIgnoreCase))
                        return argument.Substring(name.Length);
                }
                return null;
            }
            finally { LocalFree(args); }
        }

        private sealed class KernelHandle : SafeHandleZeroOrMinusOneIsInvalid
        {
            private KernelHandle() : base(true) { }
            protected override bool ReleaseHandle() { return CloseHandle(handle); }
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct ProcessEntry
        {
            internal uint Size, Usage, Pid;
            internal UIntPtr DefaultHeap;
            internal uint Module, Threads, Parent;
            internal int Priority;
            internal uint Flags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            internal string Executable;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern KernelHandle CreateToolhelp32Snapshot(uint flags, uint processId);
        [DllImport("kernel32.dll", EntryPoint = "Process32FirstW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32First(KernelHandle snapshot, ref ProcessEntry entry);
        [DllImport("kernel32.dll", EntryPoint = "Process32NextW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32Next(KernelHandle snapshot, ref ProcessEntry entry);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern KernelHandle OpenProcess(uint access, bool inheritHandle, int processId);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ProcessIdToSessionId(uint id, out uint session);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetProcessTimes(KernelHandle process, out long created, out long exited, out long kernel, out long user);
        [DllImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool QueryFullProcessImageName(KernelHandle process, int flags, StringBuilder image, ref int size);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(KernelHandle handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateProcess(KernelHandle process, uint exitCode);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern IntPtr CommandLineToArgvW(string command, out int count);
        [DllImport("kernel32.dll")]
        private static extern IntPtr LocalFree(IntPtr pointer);
    }
}
