using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace PulseCleanup
{
    internal sealed class CleanupEngine
    {
        private const string AppCategory = "Экземпляр Pulse", UpdaterCategory = "Старый updater";
        private readonly string executable;
#if TEST_FIXTURES
        private readonly string fixture;
        private readonly FixtureProcesses processes;
        internal CleanupEngine(string fixture)
        {
            this.fixture = fixture;
            processes = new FixtureProcesses(fixture);
            executable = SafePath.Normalize(System.Reflection.Assembly.GetExecutingAssembly().Location);
        }
#else
        private WindowsIntegration integration;
        internal CleanupEngine(string executable)
        {
            this.executable = SafePath.Normalize(executable);
        }
#endif

        private bool InScope(string path)
        {
            if (path == null || SafePath.Comparer.Equals(executable, path)) return false;
#if TEST_FIXTURES
            return SafePath.IsBelow(path, fixture);
#else
            return true;
#endif
        }

        internal CleanupPlan Discover(IEnumerable<string> extraFolders, IEnumerable<string> extraImages)
        {
            var plan = new CleanupPlan();
            var report = plan.Preview;
            var candidates = new Dictionary<string, bool>(SafePath.Comparer);
            var folders = new Dictionary<string, InstallWork>(SafePath.Comparer);
            Action<string, bool> candidate = (supplied, explicitChoice) => {
                string path = SafePath.Normalize(supplied);
                if (InScope(path))
                {
                    bool previous;
                    candidates.TryGetValue(path, out previous);
                    candidates[path] = previous || explicitChoice;
                }
                else if (explicitChoice)
                    report.Unchecked(AppCategory, supplied, "Файл находится за пределами выбранной области.");
            };

#if TEST_FIXTURES
            foreach (string name in new[] { "installs", "portable", "system", "profiles" })
                Scan(Path.Combine(fixture, name), false, candidate, report);
            processes.DiscoverImages(path => candidate(path, false), report);
#else
            integration = new WindowsIntegration();
            integration.DiscoverImages(path => candidate(path, false), report);
            AddStandardLocations(candidate, report);
            report.Unchecked("Область поиска", "Невыбранные произвольные каталоги",
                "Для переносимых копий в других папках укажите каталог или конкретный EXE.");
#endif
            foreach (string supplied in extraFolders)
            {
                string path = SafePath.Normalize(supplied);
                if (InScope(path)) Scan(path, true, candidate, report);
                else report.Unchecked("Дополнительный поиск", supplied, "Путь находится за пределами выбранной области.");
            }
            foreach (string path in extraImages) candidate(path, true);
            foreach (var entry in candidates)
                IdentifyImage(entry.Key, entry.Value, folders, plan);

            foreach (InstallWork install in folders.Values)
            {
                foreach (string name in new[] { "Pulse-Update-2.exe", "Pulse-Update.exe" })
                    IdentifyImage(Path.Combine(install.Folder, name), false, null, plan);
                DiscoverInstall(install, plan);
                FindUpdateFiles(install, plan);
                plan.Installs.Add(install);
            }

#if TEST_FIXTURES
            processes.Discover(plan, report);
#else
            integration.Discover(plan, report);
#endif
            foreach (var item in plan.Integrations)
                report.Planned(item.Category, item.Target, item.Proof);
            return plan;
        }

#if !TEST_FIXTURES
        private void AddStandardLocations(Action<string, bool> candidate, CleanupReport report)
        {
            var locations = new HashSet<string>(SafePath.Comparer);
            foreach (var folder in new[] { Environment.SpecialFolder.ProgramFiles,
                Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.CommonApplicationData })
            {
                string known = SafePath.Normalize(Environment.GetFolderPath(folder));
                if (known != null) locations.Add(Path.Combine(known, "Pulse"));
            }
            string local = SafePath.Normalize(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
            if (local != null) locations.Add(Path.Combine(local, "Programs", "Pulse"));
            string temp = SafePath.Normalize(Path.GetTempPath());
            if (temp != null) locations.Add(Path.Combine(temp, "Pulse"));
            string desktop = SafePath.Normalize(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
            if (desktop != null) { locations.Add(desktop); locations.Add(Path.Combine(desktop, "Pulse")); }
            foreach (string profilePath in integration.DiscoverProfileRoots(report))
            {
                string profile = SafePath.Normalize(profilePath);
                if (profile == null) continue;
                locations.Add(Path.Combine(profile, @"AppData\Local\Programs\Pulse"));
                locations.Add(Path.Combine(profile, @"AppData\Local\Temp\Pulse"));
                locations.Add(Path.Combine(profile, "Desktop"));
                locations.Add(Path.Combine(profile, "Desktop", "Pulse"));
                locations.Add(Path.Combine(profile, "Downloads"));
            }
            try
            {
                foreach (var drive in DriveInfo.GetDrives())
                    if (drive.DriveType == DriveType.Fixed) locations.Add(Path.Combine(drive.Name, "Pulse"));
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                report.DiscoveryFailed("Тома Windows", "Локальные диски", error);
            }
            foreach (string folder in locations)
                foreach (string name in new[] { "Pulse.exe", "Pulse-Update-2.exe", "Pulse-Update.exe" })
                    candidate(Path.Combine(folder, name), false);
        }
#endif

        private static void Scan(string path, bool explicitChoice, Action<string, bool> candidate, CleanupReport report)
        {
            if (path.Length == 3)
            {
                report.Unchecked("Поиск копий", path, "Выберите конкретный каталог вместо всего тома.");
                return;
            }
            int budget = 20000;
            Visit(path, 0, explicitChoice, candidate, report, ref budget);
        }

        private static void Visit(string path, int depth, bool explicitChoice, Action<string, bool> candidate,
            CleanupReport report, ref int budget)
        {
            if (depth > 16 || budget < 1)
            {
                report.Unchecked("Поиск копий", path, "Достигнут предел глубины или числа объектов. Проверьте вложенный каталог отдельно.");
                return;
            }
            try
            {
                using (var directory = SafePath.Open(path, true, false))
                {
                    var entries = directory.Entries(budget);
                    budget -= entries.Count;
                    foreach (var entry in entries)
                    {
                        string child = path + "\\" + entry.Name;
                        if (!SafePath.IsSafeName(entry.Name) || entry.Reparse)
                        {
                            if (entry.Directory || entry.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                                report.Unchecked("Поиск копий", child, "Перенаправление или неподдерживаемое имя пропущено.");
                            continue;
                        }
                        if (entry.Directory) Visit(child, depth + 1, explicitChoice, candidate, report, ref budget);
                        else if (entry.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) candidate(child, false);
                    }
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (explicitChoice && depth == 0 && SafePath.IsMissing(error))
                    report.Unchecked("Поиск копий", path, "Выбранный каталог отсутствует.");
                else report.DiscoveryFailed("Поиск копий", path, error);
            }
        }

        private void IdentifyImage(string path, bool explicitChoice, IDictionary<string, InstallWork> folders, CleanupPlan plan)
        {
            if (!InScope(path) || plan.ContainsImage(path)) return;
            try
            {
                using (var handle = SafePath.Open(path, false, false))
                {
                    string hash = handle.Stamp.Size <= 128 * 1024 * 1024 ? handle.Sha256() : null;
                    ImageKind kind = ProductFiles.Identify(hash);
                    if (kind == ImageKind.Unknown || (folders == null && kind != ImageKind.Updater))
                    {
                        if (explicitChoice || ProductFiles.LooksLikeImageName(Path.GetFileName(path)))
                            plan.Preview.Unchecked(AppCategory, path, "SHA-256 не соответствует известным выпускам Pulse.");
                        return;
                    }
                    bool isApp = kind == ImageKind.Application;
                    string category = isApp ? AppCategory : UpdaterCategory;
                    var item = new FileWork(category, path, "Подтверждённый SHA-256 " + hash, handle.Stamp, false, hash);
                    plan.AddImage(item, isApp);
                    plan.Preview.Planned(item.Category, path, item.Proof);
                    if (isApp)
                    {
                        string folder = Path.GetDirectoryName(path);
                        InstallWork install;
                        if (!folders.TryGetValue(folder, out install))
                        {
                            install = new InstallWork(folder);
                            folders.Add(folder, install);
                        }
                        install.Images.Add(item);
                    }
                    else plan.Updaters.Add(item);
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (explicitChoice && SafePath.IsMissing(error))
                    plan.Preview.Unchecked(AppCategory, path, "Выбранный файл отсутствует.");
                else plan.Preview.DiscoveryFailed(AppCategory, path, error);
            }
        }

        private static void FindUpdateFiles(InstallWork install, CleanupPlan plan)
        {
            try
            {
                using (var directory = SafePath.Open(install.Folder, true, false))
                {
                    foreach (var entry in directory.Entries(20000))
                    {
                        if (entry.Directory || !ProductFiles.IsUpdateSibling(entry.Name)) continue;
                        string path = Path.Combine(install.Folder, entry.Name);
                        try
                        {
                            using (var handle = SafePath.Open(path, false, false))
                            {
                                string hash = handle.Stamp.Size <= 128 * 1024 * 1024 ? handle.Sha256() : null;
                                if (ProductFiles.Identify(hash) != ImageKind.Application)
                                {
                                    plan.Preview.Unchecked(UpdaterCategory, path, "Принадлежность резервного или временного файла не подтверждена.");
                                    continue;
                                }
                                var item = new FileWork(UpdaterCategory, path, "Имя транзакции старого updater и подтверждённый SHA-256.",
                                    handle.Stamp, false, hash);
                                install.OtherFiles.Add(item);
                                plan.Preview.Planned(item.Category, path, item.Proof);
                            }
                        }
                        catch (Exception error) when (CleanupReport.Expected(error))
                        {
                            plan.Preview.DiscoveryFailed(UpdaterCategory, path, error);
                        }
                    }
                    if (install.Config != null && SafePath.Comparer.Equals(Path.GetFileName(install.Folder), "Pulse"))
                        install.EmptyInstallFolder = new FileWork(AppCategory, install.Folder,
                            "Пустая папка подтверждённой установки.", directory.Stamp, true, null);
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                plan.Preview.DiscoveryFailed(UpdaterCategory, install.Folder, error);
            }
        }

        private void DiscoverInstall(InstallWork install, CleanupPlan plan)
        {
            string configured;
            bool configKnown = ProductFiles.ReadConfig(install, plan.Preview, out configured);
            string data = Path.Combine(install.Folder, "Data");
            string portable = Path.Combine(install.Folder, "PulseData");
            var inspect = new HashSet<string>(SafePath.Comparer) { data, portable };
            string configuredPath = configKnown ? data : null;
            if (configKnown && !string.IsNullOrEmpty(configured))
            {
                string absolute = SafePath.Normalize(configured);
                if (absolute == null && SafePath.Comparer.Equals(configured, "Data")) absolute = data;
                if (absolute == null && SafePath.Comparer.Equals(configured, "PulseData")) absolute = portable;
                if (!InScope(absolute) || absolute.Length == 3)
                {
                    plan.Preview.Unchecked("Локальные данные", install.Config.Path,
                        "Путь data= не удалось однозначно связать с поддерживаемым локальным каталогом.");
                    install.UnverifiedData = true;
                }
                else
                {
                    configuredPath = absolute;
                    inspect.Add(absolute);
                }
            }
            foreach (string path in inspect)
            {
                if (!InScope(path)) continue;
                bool privateSibling = SafePath.Comparer.Equals(path, data) || SafePath.Comparer.Equals(path, portable);
                try
                {
                    DataWork found = ProductFiles.DiscoverData(path, privateSibling, SafePath.Comparer.Equals(path, configuredPath), plan);
                    if (found != null) install.Data.Add(found);
                }
                catch (Exception error) when (CleanupReport.Expected(error))
                {
                    plan.Preview.DiscoveryFailed("Локальные данные", path, error);
                    if (!SafePath.IsMissing(error)) install.UnverifiedData = true;
                }
            }
        }

        internal CleanupReport Apply(CleanupPlan plan)
        {
            var report = new CleanupReport();
            report.CopyIssuesFrom(plan.Preview);

#if TEST_FIXTURES
            processes.Apply(plan, report);
#else
            integration.Apply(plan, report);
#endif

            foreach (var item in plan.Updaters) RemoveImage(item, plan, report);
            var dataResults = new Dictionary<string, bool>(SafePath.Comparer);
            foreach (var install in plan.Installs) ApplyInstall(install, plan, report, dataResults);
            return report;
        }

        private static void ApplyInstall(InstallWork install, CleanupPlan plan, CleanupReport report,
            IDictionary<string, bool> dataResults)
        {
            bool blocked = install.Images.Any(image => plan.IsImageBlocked(image.Path));
            bool keepAnchor = install.UnverifiedData || blocked;
            FileWork anchorItem = install.Images.First();
            if (!blocked)
            {
                try
                {
                    using (var anchor = anchorItem.Pin(false))
                    using (var config = install.Config == null ? null : ProductFiles.PinConfigAfterClose(install))
                    {
                        if (anchor == null || (install.Config != null && config == null))
                        {
                            report.Remaining(AppCategory, install.Folder, "EXE или Pulse.ini изменились после предпросмотра. Выполните новый поиск.");
                            return;
                        }
                        foreach (var data in install.Data)
                        {
                            bool cleaned;
                            if (!dataResults.TryGetValue(data.Path, out cleaned))
                            {
                                cleaned = !plan.Installs.Where(other => other.Data.Any(member => SafePath.Comparer.Equals(member.Path, data.Path)))
                                    .SelectMany(other => other.Images).Any(image => plan.IsImageBlocked(image.Path)) &&
                                    ApplyData(data, plan, report);
                                if (!cleaned && !data.ProfileIncomplete)
                                    report.Remaining("Локальные данные", data.Path, "Сохранились подтверждённые или недоступные компоненты этой области.");
                                dataResults.Add(data.Path, cleaned);
                            }
                            keepAnchor |= !cleaned;
                        }
                    }
                }
                catch (Exception error) when (CleanupReport.Expected(error))
                {
                    if (SafePath.IsMissing(error))
                        report.Remaining(AppCategory, install.Folder, "Файл, подтверждавший установку, исчез после предпросмотра. Выполните новый поиск.");
                    else report.Failed(AppCategory, install.Folder, error);
                    return;
                }
            }
            else
            {
                foreach (var data in install.Data)
                    report.Remaining("Локальные данные", data.Path, "Данные сохранены до устранения связанных процессов или следов Windows.");
            }

            foreach (var item in install.OtherFiles) Remove(item, report);
            if (keepAnchor)
            {
                if (install.Config != null)
                    report.Remaining(install.Config.Category, install.Config.Path, "Связь с данными сохранена для повторной попытки.");
                if (!plan.IsImageBlocked(anchorItem.Path))
                    report.Remaining(anchorItem.Category, anchorItem.Path, "Подтверждающий EXE сохранён для повторной попытки очистки оставшихся данных.");
            }
            else if (install.Config != null)
            {
                keepAnchor = !Remove(install.Config, report);
                if (keepAnchor)
                    report.Remaining(anchorItem.Category, anchorItem.Path, "Подтверждающий EXE сохранён до удаления Pulse.ini.");
            }
            foreach (var item in install.Images)
                if (!keepAnchor || item != anchorItem) RemoveImage(item, plan, report);
            if (!keepAnchor && install.EmptyInstallFolder != null) Remove(install.EmptyInstallFolder, report);
        }

        private static bool ApplyData(DataWork data, CleanupPlan plan, CleanupReport report)
        {
            const string category = "Локальные данные";
            if (plan.IsWebViewBlocked(data.WebView))
            {
                report.Remaining(category, data.Path, "Подтверждённый процесс WebView2 продолжает использовать данные.");
                return false;
            }
            if (data.DataRoot == null) return false;
            bool complete = !data.ProfileIncomplete;
            try
            {
                using (var root = data.DataRoot.Pin(false))
                {
                    if (root == null)
                    {
                        report.Remaining(category, data.Path, "Каталог данных заменён после предпросмотра.");
                        return false;
                    }
                    if (!ProductFiles.ReviewProfileAfterClose(data, report)) return false;
                    complete &= !data.ProfileIncomplete;
                    foreach (var file in data.Members.Where(item => !data.ProfileWitnesses.Contains(item.Path)))
                        complete &= Remove(file, report);
                    if (complete) complete = RemoveProfileWitnesses(data, report);
                    if (complete && data.NativeLoader != null) complete = Remove(data.NativeLoader, report);
                    if (!complete)
                    {
                        foreach (var item in data.Members.Where(item => data.ProfileWitnesses.Contains(item.Path)))
                            if (!report.Lines.Any(line => SafePath.Comparer.Equals(line.Target, item.Path)))
                                report.Remaining(item.Category, item.Path, "Признак принадлежности профиля сохранён до следующей попытки.");
                        if (data.NativeLoader != null && !report.Lines.Any(line => SafePath.Comparer.Equals(line.Target, data.NativeLoader.Path)))
                            report.Remaining(data.NativeLoader.Category, data.NativeLoader.Path,
                                "Проверенный загрузчик сохранён до следующей попытки.");
                    }
                    else
                    {
                        foreach (var folder in data.Folders.OrderByDescending(item => item.Path.Length))
                            Remove(folder, report);
                    }
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (!SafePath.IsMissing(error)) report.Failed(category, data.Path, error);
                return SafePath.IsMissing(error);
            }
            if (complete && data.DataFolder != null) Remove(data.DataFolder, report);
            return complete;
        }

        private static bool RemoveProfileWitnesses(DataWork data, CleanupReport report)
        {
            var witnesses = new List<KeyValuePair<FileWork, PinnedPath>>();
            try
            {
                bool canDelete = true;
                foreach (var item in data.Members.Where(file => data.ProfileWitnesses.Contains(file.Path)))
                {
                    try
                    {
                        var handle = item.Pin(true);
                        if (handle == null)
                        {
                            report.Remaining(item.Category, item.Path, "Содержимое изменилось после предпросмотра.");
                            canDelete = false;
                            continue;
                        }
                        witnesses.Add(new KeyValuePair<FileWork, PinnedPath>(item, handle));
                        handle.CheckDelete();
                    }
                    catch (Exception error) when (CleanupReport.Expected(error))
                    {
                        if (SafePath.IsMissing(error)) continue;
                        report.Failed(item.Category, item.Path, error);
                        canDelete = false;
                    }
                }
                if (!canDelete) return false;
                foreach (var witness in witnesses)
                {
                    try { witness.Value.Delete(); }
                    catch (Exception error) when (CleanupReport.Expected(error))
                    {
                        report.Failed(witness.Key.Category, witness.Key.Path, error);
                        return false;
                    }
                    witness.Value.Dispose();
                    if (!CheckGone(witness.Key, report)) return false;
                }
                return true;
            }
            finally
            {
                foreach (var witness in witnesses) witness.Value.Dispose();
            }
        }

        private static void RemoveImage(FileWork item, CleanupPlan plan, CleanupReport report)
        {
            if (plan.IsImageBlocked(item.Path))
                report.Remaining(item.Category, item.Path, "Остался связанный процесс или элемент интеграции Windows.");
            else Remove(item, report);
        }

        private static bool Remove(FileWork item, CleanupReport report)
        {
            try
            {
                using (var file = item.Pin(true))
                {
                    if (file == null)
                    {
                        report.Remaining(item.Category, item.Path, "Объект изменился после проверки. Выполните новый поиск.");
                        return false;
                    }
                    if (item.Directory && file.Entries(20000).Count > 0)
                    {
                        report.Preserved(item.Category, item.Path, "Каталог сохранён вместе с оставшимися объектами.");
                        return true;
                    }
                    file.Delete();
                }
                return CheckGone(item, report);
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (SafePath.IsMissing(error)) return true;
                report.Failed(item.Category, item.Path, error);
                return false;
            }
        }

        private static bool CheckGone(FileWork item, CleanupReport report)
        {
            try
            {
                using (SafePath.Open(item.Path, item.Directory, false)) { }
                report.Remaining(item.Category, item.Path, "После операции по этому пути есть объект. Повторите поиск.");
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                if (SafePath.IsMissing(error))
                {
                    report.Added(item.Category, item.Path, "Удалено.");
                    return true;
                }
                report.Failed(item.Category, item.Path, error);
            }
            return false;
        }
    }
}
