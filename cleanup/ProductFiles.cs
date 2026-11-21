using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace PulseCleanup
{
    internal enum ImageKind { Unknown, Application, Updater }

    internal static class ProductFiles
    {
        internal const string IniHeader = "; Pulse от exepcstudio — настройки этой копии";
        private const string LoaderHash = "462B36FD1BE6CA9F7563466A89E57C41EF4A4DEF3E0A84FA885D203AEA4A3AAF";
        private const string DataCategory = "Локальные данные";
        private const string ProfileCategory = "Профиль WebView2";
        private enum ProfileStatus { Ready, Shared, Busy, Unreadable }
        private static readonly Regex UpdateSibling = new Regex(
            @"^\.pulse-update-[0-9a-f]{32}\.(tmp|rollback)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        private static readonly Regex PulseLogLine = new Regex(
            @"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} (notify kind=|bridge )",
            RegexOptions.CultureInvariant);
        private static readonly Regex StorageOrigins = new Regex(
            @"(?:META(?:ACCESS)?:|_)(https?://(?:[a-z0-9.-]{1,253}|\[[0-9a-f:.]{1,45}\])(?::[0-9]{1,5})?|file://|chrome-extension://[a-z]{32})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        internal static ImageKind Identify(string hash)
        {
            if (hash == "572A18BD452ADC0E78EC0BF860F3D0B6868869A0889FC7A806D4A6353E16547E")
                return ImageKind.Updater;
            if (hash == "A25F33E71364BE8CC1E6FAE56210D4A354F87D1ADF29752562667513FCCF4005" ||
                hash == "AA697B9B6E50F7F2CEB17C4753220C3C59B2AD374E51DC459303F219C584ABEB" ||
                BuildIdentity.ProvidedHashes.Contains(hash, StringComparer.Ordinal))
                return ImageKind.Application;
#if TEST_FIXTURES
            if (BuildIdentity.FixtureHash != null && hash == BuildIdentity.FixtureHash)
                return ImageKind.Application;
#endif
            return ImageKind.Unknown;
        }

        internal static bool LooksLikeImageName(string name)
        {
            return SafePath.Comparer.Equals(name, "Pulse.exe") || SafePath.Comparer.Equals(name, "Pulse-Update.exe") ||
                SafePath.Comparer.Equals(name, "Pulse-Update-2.exe");
        }

        internal static bool IsUpdateSibling(string name)
        {
            return SafePath.Comparer.Equals(name, "Pulse.exe.bak") || UpdateSibling.IsMatch(name);
        }

        internal static bool ReadConfig(InstallWork install, CleanupReport report, out string dataValue)
        {
            dataValue = null;
            string path = Path.Combine(install.Folder, "Pulse.ini");
            try
            {
                using (var handle = SafePath.Open(path, false, false))
                {
                    IDictionary<string, string> values;
                    if (!TryParseConfig(handle, out values))
                    {
                        report.Unchecked("Настройки", path, "Не удалось подтвердить формат настроек этого Pulse.");
                        install.UnverifiedData = true;
                        return false;
                    }
                    install.Config = new FileWork("Настройки", path,
                        "Маркер Pulse от exepcstudio и известные настройки рядом с подтверждённым EXE.",
                        handle.Stamp, false, handle.Sha256());
                    install.ConfigScope = values;
                    values.TryGetValue("data", out dataValue);
                    report.Planned(install.Config.Category, path, install.Config.Proof);
                    return true;
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (!SafePath.IsMissing(error)) install.UnverifiedData = true;
                report.DiscoveryFailed("Настройки", path, error);
                return false;
            }
        }

        internal static PinnedPath PinConfigAfterClose(InstallWork install)
        {
            FileWork expected = install.Config;
            var handle = SafePath.Open(expected.Path, false, false);
            bool correct = false;
            try
            {
                IDictionary<string, string> values;
                if (!expected.Stamp.SameObject(handle.Stamp) || !TryParseConfig(handle, out values) ||
                    values.Count != install.ConfigScope.Count || !install.ConfigScope.All(item =>
                    {
                        string current;
                        return values.TryGetValue(item.Key, out current) && String.Equals(item.Value, current, StringComparison.Ordinal);
                    }))
                    return null;
                install.Config = new FileWork(expected.Category, expected.Path, expected.Proof, handle.Stamp, false, handle.Sha256());
                correct = true;
                return handle;
            }
            finally { if (!correct) handle.Dispose(); }
        }

        private static bool TryParseConfig(PinnedPath handle, out IDictionary<string, string> values)
        {
            values = new Dictionary<string, string>(SafePath.Comparer);
            if (handle.Stamp.Size > 32768) return false;
            bool sawWindow = false;
            using (var stream = handle.Read())
            using (var reader = new StreamReader(stream, new UTF8Encoding(false, true)))
            {
                if (!String.Equals(reader.ReadLine(), IniHeader, StringComparison.Ordinal)) return false;
                for (string line = reader.ReadLine(); line != null; line = reader.ReadLine())
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    int equals = line.IndexOf('=');
                    if (equals <= 0) return false;
                    string key = line.Substring(0, equals).Trim(), value = line.Substring(equals + 1).Trim();
                    if (SafePath.Comparer.Equals(key, "window"))
                    {
                        if (sawWindow || !ValidWindowBounds(value)) return false;
                        sawWindow = true;
                        continue;
                    }
                    if (values.ContainsKey(key)) return false;
                    if (SafePath.Comparer.Equals(key, "data"))
                    {
                        if (value.Any(c => Char.IsControl(c))) return false;
                    }
                    else if (!(SafePath.Comparer.Equals(key, "tray") || SafePath.Comparer.Equals(key, "autostart") ||
                        SafePath.Comparer.Equals(key, "portable")) ||
                        (value != "0" && value != "1")) return false;
                    values.Add(key, value);
                }
                return values.Count > 0;
            }
        }

        private static bool ValidWindowBounds(string value)
        {
            string[] fields = value.Split(',');
            if (fields.Length != 5 || (fields[4] != "0" && fields[4] != "1")) return false;
            for (int i = 0; i < 4; i++)
            {
                int ignored;
                if (!Int32.TryParse(fields[i], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out ignored)) return false;
            }
            return true;
        }

        internal static DataWork DiscoverData(string path, bool privateSibling, bool configured, CleanupPlan plan)
        {
            CleanupReport report = plan.Preview;
            var data = new DataWork(path) { PrivateSibling = privateSibling };
            using (var root = TryOpenDirectory(path, data, report, DataCategory))
            {
                if (root == null) return data.ProfileIncomplete ? data : null;
                data.DataRoot = new FileWork(DataCategory, path, "Каталог данных", root.Stamp, true, null);
                data.NativeLoader = FindLoader(data, report);
                string view = Path.Combine(path, "WebView");
                using (var profileRoot = TryOpenDirectory(view, data, report, ProfileCategory))
                {
                    if (profileRoot != null)
                    {
                        DiscoverProfile(profileRoot, data, configured, plan);
                    }
                }
                if (data.NativeLoader != null || data.WebView != null)
                {
                    DiscoverLog(data, report);
                    if (data.NativeLoader != null)
                    {
                        string version = Path.GetDirectoryName(data.NativeLoader.Path);
                        AddFolder(data, version, report);
                        AddFolder(data, Path.GetDirectoryName(version), report);
                    }
                    if (privateSibling)
                    {
                        data.DataFolder = new FileWork(DataCategory, path, "Пустой каталог данных Pulse.", root.Stamp, true, null);
                        report.Planned(DataCategory, path, data.DataFolder.Proof);
                    }
                }
                else if (!data.ProfileIncomplete && configured && root.Entries(20000).Count != 0)
                {
                    report.Unchecked(DataCategory, path, "Данные в указанном каталоге не подтвердились по структуре профиля или хэшу загрузчика.");
                    data.ProfileIncomplete = true;
                }
                else if (!data.ProfileIncomplete) return null;
            }
            return data;
        }

        private static void DiscoverProfile(PinnedPath profileRoot, DataWork data, bool configured, CleanupPlan plan)
        {
            string root = profileRoot.Path;
            CleanupReport report = plan.Preview;
            var inspection = new CleanupReport();
            string origin;
            ProfileStatus status = InspectProfile(root, out origin, inspection);
            if (status == ProfileStatus.Busy && configured && data.NativeLoader != null)
            {
                BindView(profileRoot, data);
                data.ProfileDeferred = true;
                plan.AddDeferredWebView(root);
                report.Planned(ProfileCategory, root,
                    "Хранилище занято. Принадлежность и служебные файлы этого каталога будут проверены повторно после закрытия Pulse.");
                return;
            }
            if (status != ProfileStatus.Ready || !HasProfileShape(root) ||
                (origin == null && !(data.PrivateSibling && data.NativeLoader != null)))
            {
                report.CopyIssuesFrom(inspection);
                ReportProfileIssue(root, status, report);
                data.ProfileIncomplete = true;
                return;
            }
            BindView(profileRoot, data);
            plan.AddWebView(root);
            report.Planned(ProfileCategory, root, origin != null
                ? "Выделенный путь Pulse.ini и след origin app.pulse.invalid в хранилище."
                : "Выделенный каталог рядом с подтверждённым EXE, загрузчик с известным SHA-256 и структура профиля.");
            CollectConfirmedProfile(profileRoot, data, origin, report, true);
        }

        private static void BindView(PinnedPath profileRoot, DataWork data)
        {
            data.WebView = profileRoot.Path;
            data.ViewRoot = new FileWork(ProfileCategory, profileRoot.Path, "Корень выделенного WebView2.",
                profileRoot.Stamp, true, null);
        }

        private static bool HasProfileShape(string root)
        {
            return ProfileJson(Path.Combine(root, @"EBWebView\Local State")) &&
                ProfileJson(Path.Combine(root, @"EBWebView\Default\Preferences"));
        }

        private static void ReportProfileIssue(string path, ProfileStatus status, CleanupReport report)
        {
            string reason;
            switch (status)
            {
                case ProfileStatus.Shared:
                    reason = "Обнаружены данные другого сайта или отдельный профиль WebView2.";
                    break;
                case ProfileStatus.Busy:
                    reason = "Хранилище всё ещё занято, принадлежность профиля проверить не удалось.";
                    break;
                case ProfileStatus.Unreadable:
                    reason = "Чтение признаков владения профилем завершилось ошибкой.";
                    break;
                default:
                    reason = "Принадлежность профиля Pulse не установлена по структуре и признаку app.pulse.invalid.";
                    break;
            }
            report.Unchecked(ProfileCategory, path, reason);
        }

        private static void CollectConfirmedProfile(PinnedPath profileRoot, DataWork data, string origin,
            CleanupReport report, bool showPlan)
        {
            data.ViewVerifiedByLoader = origin == null;
            data.ProfileWitnesses.Add(Path.Combine(profileRoot.Path, @"EBWebView\Local State"));
            data.ProfileWitnesses.Add(Path.Combine(profileRoot.Path, @"EBWebView\Default\Preferences"));
            if (origin != null) data.ProfileWitnesses.Add(origin);
            int budget = 20000;
            CollectProfile(profileRoot, "", data, report, ref budget, showPlan);
            data.Folders.Add(new FileWork(ProfileCategory, profileRoot.Path, "Пустой корень выделенного профиля.",
                profileRoot.Stamp, true, null));
        }

        internal static bool ReviewProfileAfterClose(DataWork data, CleanupReport report)
        {
            if (!data.ProfileDeferred) return ProfileStillSuitable(data, report);
            using (var root = data.ViewRoot.Pin(false))
            using (var loader = data.NativeLoader.Pin(false))
            {
                if (root == null || loader == null)
                {
                    report.Remaining(ProfileCategory, data.WebView, "Просмотренный профиль WebView2 или его загрузчик заменены.");
                    return false;
                }
                string origin = null;
                ProfileStatus status = ProfileStatus.Busy;
                var inspection = new CleanupReport();
                bool confirmed = false;
                for (int attempt = 0; attempt < 9; attempt++)
                {
                    if (attempt != 0) Thread.Sleep(250);
                    inspection = new CleanupReport();
                    status = InspectProfile(root.Path, out origin, inspection);
                    if (status == ProfileStatus.Shared || status == ProfileStatus.Unreadable) break;
                    if (status == ProfileStatus.Ready && HasProfileShape(root.Path) && (origin != null || data.PrivateSibling))
                    {
                        confirmed = true;
                        break;
                    }
                }
                if (!confirmed)
                {
                    report.CopyIssuesFrom(inspection);
                    ReportProfileIssue(root.Path, status, report);
                    return false;
                }
                CollectConfirmedProfile(root, data, origin, report, false);
                data.ProfileDeferred = false;
                return true;
            }
        }

        internal static bool ProfileStillSuitable(DataWork data, CleanupReport report)
        {
            if (data.ViewRoot == null) return true;
            if (data.ProfileDeferred) return false;
            using (var root = data.ViewRoot.Pin(false))
            {
                string origin;
                if (root != null && InspectProfile(data.WebView, out origin, report) == ProfileStatus.Ready)
                {
                    if (origin != null) return true;
                    if (data.ViewVerifiedByLoader)
                    {
                        using (var loader = data.NativeLoader.Pin(false))
                            if (loader != null) return true;
                    }
                }
            }
            report.Remaining(ProfileCategory, data.WebView, "Профиль изменился или появились признаки общего использования.");
            return false;
        }

        private static ProfileStatus InspectProfile(string webView, out string origin, CleanupReport report)
        {
            origin = null;
            string root = Path.Combine(webView, "EBWebView");
            ProfileStatus status = InspectOtherStorage(root, entry => entry.Directory &&
                (entry.Name.StartsWith("Profile ", StringComparison.OrdinalIgnoreCase) ||
                SafePath.Comparer.Equals(entry.Name, "Guest Profile") || SafePath.Comparer.Equals(entry.Name, "System Profile")), report);
            if (status != ProfileStatus.Ready) return status;
            string indexed = Path.Combine(root, @"Default\IndexedDB");
            status = InspectOtherStorage(indexed, entry => entry.Directory &&
                entry.Name.IndexOf(".indexeddb.", StringComparison.OrdinalIgnoreCase) > 0 &&
                !SafePath.Comparer.Equals(entry.Name, "https_app.pulse.invalid_0.indexeddb.leveldb") &&
                !SafePath.Comparer.Equals(entry.Name, "https_app.pulse.invalid_0.indexeddb.blob"), report);
            if (status != ProfileStatus.Ready) return status;

            string storage = Path.Combine(root, @"Default\Local Storage\leveldb");
            status = InspectStorage(storage, out origin, report);
            if (status == ProfileStatus.Ready && origin == null)
                origin = FindOriginBucketMarker(Path.Combine(indexed, "https_app.pulse.invalid_0.indexeddb.leveldb"));
            return status;
        }

        private static ProfileStatus InspectOtherStorage(string folder, Func<DirectoryEntry, bool> predicate, CleanupReport report)
        {
            try
            {
                using (var directory = SafePath.Open(folder, true, false))
                    return directory.Entries(2048).Any(predicate) ? ProfileStatus.Shared : ProfileStatus.Ready;
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                report.DiscoveryFailed(ProfileCategory, folder, error);
                return SafePath.IsMissing(error) ? ProfileStatus.Ready : ProfileStatus.Unreadable;
            }
        }

        private static bool ProfileJson(string path)
        {
            try
            {
                using (var handle = SafePath.Open(path, false, false))
                using (var stream = handle.Read())
                {
                    if (stream.Length == 0 || stream.Length > 16 * 1024 * 1024) return false;
                    int c;
                    do { c = stream.ReadByte(); } while (c == ' ' || c == '\t' || c == '\r' || c == '\n');
                    return c == '{';
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error)) { return false; }
        }

        private static string FindOriginBucketMarker(string path)
        {
            try
            {
                using (var directory = SafePath.Open(path, true, false))
                    return directory.Entries(512).Any(item => !item.Reparse && !item.Directory &&
                        SafePath.Comparer.Equals(item.Name, "CURRENT")) ? Path.Combine(path, "CURRENT") : null;
            }
            catch (Exception error) when (CleanupReport.Expected(error)) { return null; }
        }

        private static ProfileStatus InspectStorage(string path, out string origin, CleanupReport report)
        {
            origin = null;
            const int contentLimit = 64 * 1024 * 1024;
            long available = contentLimit;
            ProfileStatus status = ProfileStatus.Ready;
            try
            {
                using (var directory = SafePath.Open(path, true, false))
                {
                    foreach (var item in directory.Entries(512))
                    {
                        if (item.Directory || !WebViewLayout.LevelDbData(item.Name)) continue;
                        string table = Path.Combine(path, item.Name);
                        try
                        {
                            using (var file = SafePath.Open(table, false, false))
                            using (var stream = file.Read())
                            {
                                if (file.Stamp.Size > available)
                                    throw new IOException("Достигнут предел чтения признаков WebView2.");
                                available -= file.Stamp.Size;
                                bool own, other;
                                ReadOrigins(stream, out own, out other);
                                if (other) return ProfileStatus.Shared;
                                if (own && origin == null) origin = table;
                            }
                        }
                        catch (Exception error) when (CleanupReport.Expected(error))
                        {
                            report.DiscoveryFailed(ProfileCategory, table, error);
                            if (SafePath.IsMissing(error)) continue;
                            if (!IsSharingError(error)) status = ProfileStatus.Unreadable;
                            else if (status != ProfileStatus.Unreadable) status = ProfileStatus.Busy;
                        }
                    }
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                report.DiscoveryFailed(ProfileCategory, path, error);
                if (!SafePath.IsMissing(error))
                    return IsSharingError(error) ? ProfileStatus.Busy : ProfileStatus.Unreadable;
            }
            return status;
        }

        private static bool IsSharingError(Exception error)
        {
            var native = error as Win32Exception;
            return native != null && (native.NativeErrorCode == 32 || native.NativeErrorCode == 33);
        }

        private static void ReadOrigins(Stream stream, out bool own, out bool other)
        {
            const string ownOrigin = "https://app.pulse.invalid";
            var data = new byte[65536 + 288];
            var encoding = Encoding.GetEncoding(28591);
            own = other = false;
            int carry = 0, read;
            while ((read = stream.Read(data, carry, data.Length - carry)) > 0)
            {
                int total = carry + read, nextCarry = Math.Min(288, total);
                string window = encoding.GetString(data, 0, total);
                bool final = stream.Position >= stream.Length;
                foreach (Match match in StorageOrigins.Matches(window))
                {
                    if (!final && match.Index + match.Length >= total) continue;
                    if (SafePath.Comparer.Equals(match.Groups[1].Value, ownOrigin)) own = true;
                    else { other = true; return; }
                }
                // Clues from raw LevelDB records are corroborating evidence. Some layouts
                // keep the origin without its preceding key prefix in later table blocks.
                int app = window.IndexOf(ownOrigin, StringComparison.OrdinalIgnoreCase);
                int after = app + ownOrigin.Length;
                if (app >= 0 && ((final && after == total) ||
                    (after < total && (window[after] < '!' || window[after] == '/' || window[after] == '^'))))
                    own = true;
                Buffer.BlockCopy(data, total - nextCarry, data, 0, nextCarry);
                carry = nextCarry;
            }
        }

        private static FileWork FindLoader(DataWork data, CleanupReport report)
        {
            string path = Path.Combine(data.Path, @"bin\1.4.0\WebView2Loader.dll");
            try
            {
                using (var handle = SafePath.Open(path, false, false))
                {
                    if (handle.Stamp.Size > 2 * 1024 * 1024 || handle.Sha256() != LoaderHash)
                    {
                        report.Unchecked(DataCategory, path, "Содержимое загрузчика отличается от ресурса Pulse.");
                        return null;
                    }
                    var file = new FileWork(DataCategory, path, "SHA-256 встроенного lib.WebView2Loader.dll.", handle.Stamp, false, LoaderHash);
                    report.Planned(file.Category, file.Path, file.Proof);
                    return file;
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (!SafePath.IsMissing(error)) data.ProfileIncomplete = true;
                report.DiscoveryFailed(DataCategory, path, error);
                return null;
            }
        }

        private static void DiscoverLog(DataWork data, CleanupReport report)
        {
            string path = Path.Combine(data.Path, "pulse.log");
            try
            {
                using (var handle = SafePath.Open(path, false, false))
                {
                    if (handle.Stamp.Size > 1024 * 1024)
                    {
                        report.Unchecked(DataCategory, path, "Журнал выходит за предел проверяемого формата Pulse.");
                        return;
                    }
                    using (var stream = handle.Read())
                    using (var reader = new StreamReader(stream, new UTF8Encoding(false, true)))
                    {
                        string first = reader.ReadLine();
                        if (first == null || !PulseLogLine.IsMatch(first))
                        {
                            report.Unchecked(DataCategory, path, "Формат журнала Pulse не подтверждён.");
                            return;
                        }
                    }
                    var file = new FileWork(DataCategory, path, "Подтверждённый каталог данных и формат записи журнала.",
                        handle.Stamp, false, handle.Sha256());
                    data.Members.Add(file);
                    report.Planned(file.Category, path, file.Proof);
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (!SafePath.IsMissing(error)) data.ProfileIncomplete = true;
                report.DiscoveryFailed(DataCategory, path, error);
            }
        }

        private static PinnedPath TryOpenDirectory(string path, DataWork data, CleanupReport report, string category)
        {
            try { return SafePath.Open(path, true, false); }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (!SafePath.IsMissing(error)) data.ProfileIncomplete = true;
                report.DiscoveryFailed(category, path, error);
                return null;
            }
        }

        private static void AddFolder(DataWork data, string path, CleanupReport report)
        {
            using (var folder = TryOpenDirectory(path, data, report, DataCategory))
                if (folder != null)
                    data.Folders.Add(new FileWork(DataCategory, path, "Пустая папка извлечённого загрузчика.",
                        folder.Stamp, true, null));
        }

        private static void CollectProfile(PinnedPath root, string relative, DataWork data, CleanupReport report,
            ref int budget, bool showPlan)
        {
            IList<DirectoryEntry> entries;
            try { entries = root.Entries(Math.Max(0, budget)); }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                data.ProfileIncomplete = true;
                report.DiscoveryFailed(ProfileCategory, root.Path, error);
                return;
            }
            budget -= entries.Count;
            foreach (var entry in entries)
            {
                string suffix = relative.Length == 0 ? entry.Name : relative + "\\" + entry.Name;
                string path = root.Path + "\\" + entry.Name;
                if (!SafePath.IsSafeName(entry.Name) || entry.Reparse)
                {
                    report.Unchecked(ProfileCategory, path, "Неподдерживаемое имя или перенаправление сохранено.");
                }
                else if (entry.Directory && WebViewLayout.Directory(suffix))
                {
                    using (var directory = TryOpenDirectory(path, data, report, ProfileCategory))
                    {
                        if (directory == null) continue;
                        CollectProfile(directory, suffix, data, report, ref budget, showPlan);
                        data.Folders.Add(new FileWork(ProfileCategory, path, "Пустой служебный каталог WebView2.",
                            directory.Stamp, true, null));
                    }
                }
                else if (!entry.Directory && WebViewLayout.File(relative, entry.Name))
                {
                    try
                    {
                        bool documentedReadme = WebViewLayout.IsRuntimeReadme(relative, entry.Name);
                        bool noVarySearch = WebViewLayout.IsNoVarySearchCache(relative, entry.Name);
                        bool checkContents = documentedReadme || noVarySearch;
                        using (var file = checkContents ? SafePath.Open(path, false, false) : SafePath.ProbeFile(path))
                        {
                            string hash = documentedReadme && file.Stamp.Size <= 1024 ? file.Sha256() : null;
                            if (documentedReadme && hash != WebViewLayout.RuntimeReadmeHash)
                            {
                                report.Unchecked(ProfileCategory, path, "Содержимое README отличается от штатного README WebView2.");
                                continue;
                            }
                            if (noVarySearch)
                            {
                                using (var stream = file.Read())
                                {
                                    if (!WebViewLayout.HasNoVarySearchHeader(entry.Name, stream))
                                    {
                                        report.Unchecked(ProfileCategory, path, "Заголовок файла не соответствует формату Chromium No-Vary-Search.");
                                        continue;
                                    }
                                }
                                hash = file.Sha256();
                            }
                            var item = new FileWork(ProfileCategory, path, "Распознанный служебный объект выделенного профиля.",
                                file.Stamp, false, hash);
                            if (showPlan) report.Planned(item.Category, path, item.Proof);
                            data.Members.Add(item);
                        }
                    }
                    catch (Exception error) when (CleanupReport.Expected(error))
                    {
                        if (!SafePath.IsMissing(error)) data.ProfileIncomplete = true;
                        report.DiscoveryFailed(ProfileCategory, path, error);
                    }
                }
                else
                {
                    report.Unchecked(ProfileCategory, path, "Объект не соответствует известному формату WebView2 и сохранён.");
                }
            }
        }
    }
}
