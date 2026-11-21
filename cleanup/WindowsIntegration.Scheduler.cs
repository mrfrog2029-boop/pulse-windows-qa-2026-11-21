using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Xml;
using Microsoft.Win32.SafeHandles;

namespace PulseCleanup
{
    internal sealed partial class WindowsIntegration
    {
        private const string TaskCategory = "Планировщик задач";
        private const string ServiceCategory = "Службы Windows";
        private const uint ServiceQueryConfig = 0x0001;
        private const uint ServiceQueryStatus = 0x0004;
        private const uint ServiceStop = 0x0020;
        private const uint ServiceDelete = 0x10000;
        private const uint ServiceStopped = 1;
        private const uint ServiceStopPending = 3;
        private const uint ServiceRunning = 4;
        private const uint ServicePaused = 7;
        private const int ServiceDoesNotExist = 1060;
        private const int ServiceMarkedForDelete = 1072;

        private void ReadTasks(Action<string> addImage, CleanupReport report)
        {
            Inspect(report, TaskCategory, "Библиотека планировщика", () =>
            {
                object scheduler = OpenScheduler();
                try
                {
                    var folders = new Queue<string>();
                    folders.Enqueue(@"\");
                    int visited = 0;
                    while (folders.Count != 0 && visited++ < 4096)
                        ReadTaskFolder(scheduler, folders.Dequeue(), addImage, report, folders);
                    if (folders.Count != 0)
                        report.Unchecked(TaskCategory, "Библиотека планировщика", "Достигнут предел обхода папок задач.");
                }
                finally { ReleaseCom(scheduler); }
            });
        }

        private void ReadTaskFolder(object scheduler, string folderPath, Action<string> addImage,
            CleanupReport report, Queue<string> children)
        {
            object folder = null;
            try
            {
                folder = ((dynamic)scheduler).GetFolder(folderPath);
                Inspect(report, TaskCategory, folderPath, () => ReadFolderTasks(folder, folderPath, addImage, report));
                Inspect(report, TaskCategory, folderPath, () =>
                {
                    object folders = ((dynamic)folder).GetFolders(0);
                    try
                    {
                        int count = ((dynamic)folders).Count;
                        for (int index = 1; index <= count; index++)
                        {
                            object child = ((dynamic)folders)[index];
                            try { children.Enqueue((string)((dynamic)child).Path); }
                            finally { ReleaseCom(child); }
                        }
                    }
                    finally { ReleaseCom(folders); }
                });
            }
            catch (Exception error)
            {
                if (!Recoverable(error)) throw;
                report.Unchecked(TaskCategory, folderPath, error.Message);
                if (AccessDenied(error)) report.ElevationMayHelp();
            }
            finally { ReleaseCom(folder); }
        }

        private void ReadFolderTasks(object folder, string folderPath, Action<string> addImage, CleanupReport report)
        {
            // TASK_ENUM_HIDDEN includes ordinary hidden tasks in the scope that COM permits the caller to read.
            object tasks = ((dynamic)folder).GetTasks(1);
            try
            {
                int count = ((dynamic)tasks).Count;
                for (int index = 1; index <= count; index++)
                {
                    int itemIndex = index;
                    Inspect(report, TaskCategory, folderPath + " / " + itemIndex, () =>
                    {
                        object task = ((dynamic)tasks)[itemIndex];
                        try
                        {
                            string name = ((dynamic)task).Name;
                            string label = ((dynamic)task).Path;
                            string xml = ((dynamic)task).Xml;
                            string[] actions = TaskImages(xml);
                            foreach (string image in actions.Where(path => path != null).Distinct(StringComparer.OrdinalIgnoreCase))
                                addImage(image);
                            string fingerprint = TextHash(xml);
                            candidates.Add((plan, result) =>
                            {
                                string[] owned = actions.Where(path => path != null && plan.ContainsImage(path)).ToArray();
                                if (owned.Length == 0)
                                {
                                    if (Recognizable(name))
                                        result.Unchecked(TaskCategory, label, "Прямая цель задачи с подтверждённой принадлежностью Pulse не найдена.");
                                    return;
                                }
                                if (owned.Length != actions.Length)
                                {
                                    result.Unchecked(TaskCategory, label, "У задачи есть действия с неподтверждённой принадлежностью.");
                                    plan.Integrations.Add(new IntegrationItem(TaskCategory, label,
                                        "Задача останется для проверки: часть действий не подтверждена.",
                                        reportAfter =>
                                        {
                                            foreach (string image in owned) plan.BlockImage(image);
                                            reportAfter.Unchecked(TaskCategory, label, "Оставлены задача и связанные образы Pulse для повторной проверки.");
                                        }));
                                    return;
                                }
                                plan.Integrations.Add(new IntegrationItem(TaskCategory, label, "Все действия указывают на подтверждённые образы Pulse.",
                                    reportAfter => ApplyReference(plan, reportAfter, TaskCategory, label, owned,
                                        () => RemoveTask(plan, folderPath, name, label, owned, fingerprint, reportAfter))));
                            });
                        }
                        finally { ReleaseCom(task); }
                    });
                }
            }
            finally { ReleaseCom(tasks); }
        }

        internal static string[] TaskImages(string xml)
        {
            const string ns = "http://schemas.microsoft.com/windows/2004/02/mit/task";
            var document = new XmlDocument { XmlResolver = null };
            using (var text = new StringReader(xml))
            using (var reader = XmlReader.Create(text, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null }))
                document.Load(reader);
            var namespaces = new XmlNamespaceManager(document.NameTable);
            namespaces.AddNamespace("t", ns);
            var paths = new List<string>();
            foreach (XmlNode action in document.SelectNodes("/t:Task/t:Actions/*", namespaces))
            {
                XmlNodeList commands = action.LocalName == "Exec" && action.NamespaceURI == ns
                    ? action.SelectNodes("t:Command", namespaces) : null;
                XmlNode command = commands != null && commands.Count == 1 ? commands[0] : null;
                paths.Add(command == null ? null : ExePath(Expand(command.InnerText, null)));
            }
            return paths.ToArray();
        }

        private static object OpenScheduler()
        {
            Type type = Type.GetTypeFromProgID("Schedule.Service", true);
            object scheduler = Activator.CreateInstance(type);
            try
            {
                ((dynamic)scheduler).Connect();
                return scheduler;
            }
            catch
            {
                ReleaseCom(scheduler);
                throw;
            }
        }

        private static string TextHash(string text)
        {
            using (SHA256 hash = SHA256.Create())
                return Convert.ToBase64String(hash.ComputeHash(Encoding.UTF8.GetBytes(text)));
        }

        private static void RemoveTask(CleanupPlan plan, string folderPath, string name, string label,
            string[] images, string fingerprint, CleanupReport report)
        {
            object scheduler = null, folder = null, task = null;
            var pins = new List<PinnedPath>();
            try
            {
                scheduler = OpenScheduler();
                folder = ((dynamic)scheduler).GetFolder(folderPath);
                foreach (string image in images.Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    PinnedPath pin = PinProof(plan, image);
                    if (pin == null)
                    {
                        report.Remaining(TaskCategory, label, "Подтверждённый бинарник задачи изменился после проверки.");
                        return;
                    }
                    pins.Add(pin);
                }
                task = ((dynamic)folder).GetTask(name);
                if (!Same((string)((dynamic)task).Path, label)
                    || !string.Equals(fingerprint, TextHash((string)((dynamic)task).Xml), StringComparison.Ordinal))
                {
                    report.Remaining(TaskCategory, label, "Определение задачи изменилось после проверки.");
                    return;
                }
                ((dynamic)folder).DeleteTask(name, 0);
                ReleaseCom(task);
                task = null;
                try
                {
                    task = ((dynamic)folder).GetTask(name);
                }
                catch (Exception error) when (MissingTask(error))
                {
                    report.Added(TaskCategory, label, "Задача удалена.");
                    return;
                }
                report.Remaining(TaskCategory, label, "Задача снова обнаружена после удаления.");
            }
            catch (Exception error) when (MissingTask(error)) { }
            finally
            {
                ReleaseCom(task);
                ReleaseCom(folder);
                ReleaseCom(scheduler);
                foreach (PinnedPath pin in pins) pin.Dispose();
            }
        }

        internal static bool MissingTask(Exception error)
        {
            var com = error as COMException;
            return SafePath.IsMissing(error) || (com != null
                && (com.ErrorCode == unchecked((int)0x80070002) || com.ErrorCode == unchecked((int)0x80070003)));
        }

        private void ReadServices(Action<string> addImage, CleanupReport report)
        {
            Inspect(report, ServiceCategory, "Диспетчер служб", () =>
            {
                using (var search = new ManagementObjectSearcher(@"root\CIMV2",
                    "SELECT Name, DisplayName, PathName FROM Win32_Service",
                    new EnumerationOptions { Rewindable = false, Timeout = TimeSpan.FromSeconds(4) }))
                using (ManagementObjectCollection rows = search.Get())
                {
                    foreach (ManagementObject row in rows)
                    using (row)
                    {
                        string name = row["Name"] as string;
                        if (string.IsNullOrEmpty(name)) continue;
                        string raw = row["PathName"] as string;
                        string image = DirectCommandImage(raw);
                        bool recognizable = Recognizable(name) || Recognizable(row["DisplayName"] as string);
                        if (image == null && !recognizable) continue;
                        string fingerprint = raw == null ? null : TextHash(raw);
                        Collect(addImage, ServiceCategory, name, new[] { image }, new[] { image }, recognizable,
                            (plan, proof, result) => RemoveService(plan, name, proof, fingerprint, result));
                    }
                }
            });
        }

        private static void RemoveService(CleanupPlan plan, string name, string image, string expected, CleanupReport report)
        {
            using (ScmHandle manager = OpenSCManager(null, null, 1))
            {
                if (manager.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
                using (ScmHandle service = OpenService(manager, name, ServiceQueryConfig | ServiceQueryStatus | ServiceStop | ServiceDelete))
                {
                    if (service.IsInvalid)
                    {
                        int code = Marshal.GetLastWin32Error();
                        if (code == ServiceDoesNotExist) return;
                        if (code == ServiceMarkedForDelete)
                        {
                            ReportPendingService(name, report);
                            return;
                        }
                        throw new Win32Exception(code);
                    }
                    using (PinnedPath pin = PinProof(plan, image))
                    {
                        if (pin == null || !SameServiceConfiguration(service, image, expected))
                        {
                            report.Remaining(ServiceCategory, name, "Конфигурация или подтверждённый бинарник службы изменились.");
                            return;
                        }
                        bool wasRunning;
                        if (!StopVerifiedService(service, pin, expected, out wasRunning))
                        {
                            report.Remaining(ServiceCategory, name, "Служба не остановилась или образ работающего процесса не подтверждён.");
                            report.RestartMayHelp();
                            return;
                        }
                        if (wasRunning)
                            report.Added(ProcessCategory, "Служба " + name, "Подтверждена остановка службы.");
                        if (!SameServiceConfiguration(service, image, expected))
                        {
                            report.Remaining(ServiceCategory, name, "Конфигурация службы изменилась во время остановки.");
                            return;
                        }
                        if (!DeleteService(service))
                        {
                            int code = Marshal.GetLastWin32Error();
                            if (code != ServiceMarkedForDelete) throw new Win32Exception(code);
                        }
                    }
                }
                using (ScmHandle check = OpenService(manager, name, ServiceQueryStatus))
                {
                    int error = check.IsInvalid ? Marshal.GetLastWin32Error() : 0;
                    if (error == ServiceDoesNotExist)
                        report.Added(ServiceCategory, name, "Служба остановлена, запись удалена.");
                    else if (error == ServiceMarkedForDelete)
                        ReportPendingService(name, report);
                    else if (error == 0)
                        report.Remaining(ServiceCategory, name, "Запись службы всё ещё присутствует либо появилась снова.");
                    else
                        throw new Win32Exception(error);
                }
            }
        }

        private static void ReportPendingService(string name, CleanupReport report)
        {
            report.Remaining(ServiceCategory, name, "Диспетчер служб ещё показывает запись. Удаление может завершиться после закрытия её дескрипторов.");
            report.RestartMayHelp();
        }

        private static bool SameServiceConfiguration(ScmHandle service, string image, string expected)
        {
            uint needed;
            if (!QueryServiceConfig(service, IntPtr.Zero, 0, out needed))
            {
                int code = Marshal.GetLastWin32Error();
                if (code != 122 || needed == 0 || needed > 8192) throw new Win32Exception(code);
            }
            IntPtr storage = Marshal.AllocHGlobal(checked((int)needed));
            try
            {
                if (!QueryServiceConfig(service, storage, needed, out needed))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                var config = (ServiceConfig)Marshal.PtrToStructure(storage, typeof(ServiceConfig));
                string raw = Marshal.PtrToStringUni(config.BinaryPath);
                return (config.Type & 0x30) == 0x10 && raw != null && Same(DirectCommandImage(raw), image)
                    && string.Equals(TextHash(raw), expected, StringComparison.Ordinal);
            }
            finally { Marshal.FreeHGlobal(storage); }
        }

        private static bool StopVerifiedService(ScmHandle service, PinnedPath image, string expected, out bool wasRunning)
        {
            ServiceStatus status = ReadServiceStatus(service);
            wasRunning = status.Basic.State != ServiceStopped;
            if (status.Basic.State == ServiceStopped) return true;
            if (status.Basic.State == ServiceRunning || status.Basic.State == ServicePaused)
            {
                if (status.ProcessId == 0 || (status.Basic.Type & 0x30) != 0x10) return false;
                using (KernelHandle process = OpenProcess(QueryImage | Synchronize, false, (int)status.ProcessId))
                {
                    ObservedProcess current = Identify(process, (int)status.ProcessId, 0, Path.GetFileName(image.Path));
                    ServiceStatus checkedStatus = ReadServiceStatus(service);
                    if (!ImageAtLaunch(image.Stamp, current.Created) || !Same(current.Image, image.Path) || !Running(process)
                        || checkedStatus.ProcessId != status.ProcessId || checkedStatus.Basic.State != status.Basic.State
                        || !SameServiceConfiguration(service, image.Path, expected))
                        return false;
                    BasicServiceStatus stopped;
                    if (!ControlService(service, 1, out stopped))
                    {
                        int code = Marshal.GetLastWin32Error();
                        if (code != 1062) throw new Win32Exception(code);
                    }
                }
            }
            else if (status.Basic.State != ServiceStopPending)
                return false;

            var timer = Stopwatch.StartNew();
            do
            {
                if (ReadServiceStatus(service).Basic.State == ServiceStopped) return true;
                Thread.Sleep(125);
            } while (timer.ElapsedMilliseconds < 3000);
            return false;
        }

        private static ServiceStatus ReadServiceStatus(ScmHandle service)
        {
            uint needed;
            ServiceStatus status;
            if (!QueryServiceStatusEx(service, 0, out status, (uint)Marshal.SizeOf(typeof(ServiceStatus)), out needed))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return status;
        }

        private sealed class ScmHandle : SafeHandleZeroOrMinusOneIsInvalid
        {
            private ScmHandle() : base(true) { }
            protected override bool ReleaseHandle() { return CloseServiceHandle(handle); }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ServiceConfig
        {
            internal uint Type, Start, ErrorControl;
            internal IntPtr BinaryPath;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BasicServiceStatus
        {
            internal uint Type, State, Controls, Win32ExitCode, ServiceExitCode, CheckPoint, WaitHint;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ServiceStatus
        {
            internal BasicServiceStatus Basic;
            internal uint ProcessId, Flags;
        }

        [DllImport("advapi32.dll", EntryPoint = "OpenSCManagerW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern ScmHandle OpenSCManager(string machine, string database, uint access);
        [DllImport("advapi32.dll", EntryPoint = "OpenServiceW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern ScmHandle OpenService(ScmHandle manager, string name, uint access);
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool CloseServiceHandle(IntPtr service);
        [DllImport("advapi32.dll", EntryPoint = "QueryServiceConfigW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool QueryServiceConfig(ScmHandle service, IntPtr configuration, uint bufferSize, out uint needed);
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool QueryServiceStatusEx(ScmHandle service, int level, out ServiceStatus status, uint bufferSize, out uint needed);
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool ControlService(ScmHandle service, uint control, out BasicServiceStatus status);
        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool DeleteService(ScmHandle service);
    }
}
