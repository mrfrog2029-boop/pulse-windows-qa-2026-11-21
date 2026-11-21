#if TEST_FIXTURES
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace PulseCleanup
{
    internal static class FixtureRunner
    {
        private const string Marker = "Pulse Cleanup synthetic fixture v1";

        internal static int Run(string[] args)
        {
            Console.OutputEncoding = new UTF8Encoding(false);
            if (args.Length == 1 && args[0] == "--integration-unit")
            {
                WindowsIntegrationTests.Run();
                return 0;
            }
            if (args.Length != 2 || (args[0] != "--preview" && args[0] != "--apply-fixture" &&
                args[0] != "--deferred-regression"))
                return Error("Use --preview or --apply-fixture with a synthetic child of test-runs.");
            string requested = args[1];
            string root = SafePath.Normalize(requested);
            string area = SafePath.Normalize(Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\..\test-runs")));
            if (root == null || area == null || !SafePath.IsBelow(root, area) ||
                !SafePath.Comparer.Equals(Path.GetDirectoryName(root), area))
                return Error("The fixture must be a direct child of the test-runs directory.");
            try
            {
                using (SafePath.Open(root, true, false))
                using (var marker = SafePath.Open(Path.Combine(root, ".pulse-cleanup-test"), false, false))
                {
                    if (marker.Stamp.Size > 128) return Error("Invalid synthetic fixture marker.");
                    using (var reader = new StreamReader(marker.Read(), new UTF8Encoding(false, true)))
                        if (!String.Equals(reader.ReadToEnd().TrimEnd('\r', '\n'), Marker, StringComparison.Ordinal))
                            return Error("Invalid synthetic fixture marker.");
                    if (args[0] == "--deferred-regression")
                    {
                        DeferredProfileTests.Run(root);
                        return 0;
                    }
                    var engine = new CleanupEngine(root);
                    var plan = engine.Discover(new string[0], new string[0]);
                    var report = args[0] == "--preview" ? plan.Preview : engine.Apply(plan);
                    foreach (var line in report.Lines)
                        Console.WriteLine(String.Join("\t", Cell(line.Status), Cell(line.Category), Cell(line.Target), Cell(line.Detail)));
                    if (report.Elevation) Console.WriteLine("summary\televation");
                    if (report.Restart) Console.WriteLine("summary\trestart");
                    return 0;
                }
            }
            catch (Exception error)
            {
                return Error(error.ToString());
            }
        }

        private static int Error(string message)
        {
            Console.Error.WriteLine(message);
            return 2;
        }

        private static string Cell(string value)
        {
            return value == null ? "" : value.Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
        }
    }

    internal sealed class FixtureProcesses
    {
        private const string Category = "Процесс (фикстура)";
        private readonly string root;
        private readonly List<FixtureProcess> observed = new List<FixtureProcess>();

        private sealed class FixtureProcess
        {
            internal readonly int Pid;
            internal readonly string Image;
            internal readonly long Timestamp;

            internal FixtureProcess(int pid, string image, long timestamp)
            {
                Pid = pid;
                Image = image;
                Timestamp = timestamp;
            }
        }

        internal FixtureProcesses(string root) { this.root = root; }

        internal void DiscoverImages(Action<string> add, CleanupReport report)
        {
            if (BuildIdentity.FixtureHash == null) return;
            string path = Path.Combine(root, "fixture-pids.txt");
            try
            {
                using (var list = SafePath.Open(path, false, false))
                {
                    if (list.Stamp.Size > 4096) throw new IOException("The fixture PID list exceeds its limit.");
                    using (var reader = new StreamReader(list.Read()))
                    {
                        for (string line = reader.ReadLine(); line != null; line = reader.ReadLine())
                        {
                            int pid;
                            if (!Int32.TryParse(line, NumberStyles.None, CultureInfo.InvariantCulture, out pid) || pid <= 0) continue;
                            try
                            {
                                using (var process = Process.GetProcessById(pid))
                                {
                                    string image = SafePath.Normalize(process.MainModule.FileName);
                                    if (!SafePath.IsBelow(image, root)) continue;
                                    using (var pin = SafePath.Open(image, false, false))
                                    {
                                        if (pin.Stamp.Size > 16 * 1024 * 1024 || pin.Sha256() != BuildIdentity.FixtureHash) continue;
                                        observed.Add(new FixtureProcess(pid, image, process.StartTime.ToUniversalTime().Ticks));
                                        add(image);
                                    }
                                }
                            }
                            catch (ArgumentException) { }
                            catch (Exception error) when (CleanupReport.Expected(error))
                            {
                                report.DiscoveryFailed(Category, pid.ToString(CultureInfo.InvariantCulture), error);
                            }
                        }
                    }
                }
            }
            catch (Exception error) when (CleanupReport.Expected(error))
            {
                report.DiscoveryFailed(Category, path, error);
            }
        }

        internal void Discover(CleanupPlan plan, CleanupReport report)
        {
            foreach (var item in observed.Where(record => plan.ContainsImage(record.Image)))
                report.Planned(Category, item.Image, "PID " + item.Pid + ", подтверждённый образ синтетической фикстуры.");
        }

        internal void Apply(CleanupPlan plan, CleanupReport report)
        {
            foreach (var item in observed.Where(record => plan.ContainsImage(record.Image)))
            {
                try
                {
                    using (var process = Process.GetProcessById(item.Pid))
                    using (var image = plan.PinImage(item.Image))
                    {
                        IntPtr handle = process.Handle;
                        if (process.HasExited) continue;
                        if (handle == IntPtr.Zero || image == null || image.Sha256() != BuildIdentity.FixtureHash ||
                            process.StartTime.ToUniversalTime().Ticks != item.Timestamp ||
                            !SafePath.Comparer.Equals(SafePath.Normalize(process.MainModule.FileName), item.Image))
                        {
                            report.Remaining(Category, item.Image, "Не подтверждён процесс синтетической фикстуры.");
                            plan.BlockImage(item.Image);
                            continue;
                        }
                        bool closed = process.CloseMainWindow() && process.WaitForExit(800);
                        if (!closed && !process.HasExited) process.Kill();
                        if (process.WaitForExit(4000))
                            report.Added(Category, item.Image, "Завершён PID " + item.Pid + ".");
                        else
                        {
                            report.Remaining(Category, item.Image, "Процесс синтетической фикстуры не остановился.");
                            plan.BlockImage(item.Image);
                        }
                    }
                }
                catch (ArgumentException) { }
                catch (InvalidOperationException)
                {
                    report.Unchecked(Category, item.Image, "Процесс завершился или изменился во время повторной проверки.");
                    plan.BlockImage(item.Image);
                }
                catch (Exception error) when (CleanupReport.Expected(error))
                {
                    report.Failed(Category, item.Image, error);
                    plan.BlockImage(item.Image);
                }
            }
        }
    }
}
#endif
