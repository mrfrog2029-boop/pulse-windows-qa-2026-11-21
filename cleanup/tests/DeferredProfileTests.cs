#if TEST_FIXTURES
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;

namespace PulseCleanup
{
    internal static class DeferredProfileTests
    {
        private const string NoVarySearch = @"EBWebView\Default\Cache\No_Vary_Search";

        private sealed class Specimen
        {
            internal string Install, Data, WebView, Table, Config;
        }

        internal static void Run(string root)
        {
            string payloadPath = Path.Combine(root, "baseline-payload");
            byte[] payload;
            using (var pinned = SafePath.Open(payloadPath, false, false))
            using (var reader = pinned.Read())
            using (var bytes = new MemoryStream())
            {
                Require(ProductFiles.Identify(pinned.Sha256()) == ImageKind.Application, "Fixture payload identity.");
                reader.Position = 0;
                reader.CopyTo(bytes);
                payload = bytes.ToArray();
            }
            byte[] loader;
            var metadata = Assembly.ReflectionOnlyLoad(payload);
            using (var resource = metadata.GetManifestResourceStream("lib.WebView2Loader.dll"))
            using (var bytes = new MemoryStream())
            {
                resource.CopyTo(bytes);
                loader = bytes.ToArray();
            }

            string installs = Path.Combine(root, "installs");
            Require(!Directory.Exists(installs), "Use a fresh marked fixture.");
            var clean = Create(installs, "verified", payload, loader, false);
            var mixed = Create(installs, "mixed", payload, loader, true);
            var replaced = Create(installs, "replaced", payload, loader, false);
            var redirected = Create(installs, "redirected", payload, loader, false);
            var blocked = Create(installs, "blocked", payload, loader, false);
            var changed = Create(installs, "changed-data", payload, loader, false);
            var neighbors = Create(installs, "cache-canaries", payload, loader, false);
            string journal = WriteCacheFile(clean, NoVarySearch, "journal.baj", 0x24, 0x46, 0x7e, 0x06);
            string snapshot = WriteCacheFile(clean, NoVarySearch, "snapshot.baf", 0x62, 0xf9, 0x65, 0xce, 0, 0, 0, 0);
            string legacyJournal = WriteCacheFile(neighbors, NoVarySearch, "journal.baj", 0x98, 0x4b, 0x3c, 0x4d);
            string wrongHeader = WriteCacheFile(neighbors, NoVarySearch, "snapshot.baf", 0x24, 0x46, 0x7e, 0x06);
            string wrongName = WriteCacheFile(neighbors, NoVarySearch, "snapshot.baf.bak", 0x62, 0xf9, 0x65, 0xce);
            string wrongFolder = WriteCacheFile(neighbors, @"EBWebView\Default\Cache", "journal.baj", 0x24, 0x46, 0x7e, 0x06);
            string mixedCache = WriteCacheFile(mixed, NoVarySearch, "snapshot.baf", 0x62, 0xf9, 0x65, 0xce);
            var cases = new[] { clean, mixed, replaced, redirected, blocked, changed, neighbors };

            var engine = new CleanupEngine(root);
            CleanupPlan plan;
            var writers = new List<FileStream>();
            try
            {
                foreach (var item in cases)
                    writers.Add(new FileStream(item.Table, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite));
                plan = engine.Discover(new string[0], new string[0]);
                foreach (var item in cases)
                {
                    Require(plan.ContainsDeferredWebView(item.WebView), "Expected deferred profile for " + item.Install);
                    Require(!plan.ContainsWebView(item.WebView), "Deferred profile granted confirmed ownership.");
                }
            }
            finally { foreach (var writer in writers) writer.Dispose(); }

            // The verified app writes only window bounds on close. Its original
            // file and the data selection must still be the same at application.
            File.AppendAllText(clean.Config, "window=-1440,65,900,700,0" + Environment.NewLine);
            File.WriteAllText(changed.Config, ProductFiles.IniHeader + Environment.NewLine +
                "data=" + Path.Combine(root, "guard") + Environment.NewLine + "tray=0" + Environment.NewLine);
            string previousView = Path.Combine(replaced.Data, "WebView.original");
            Directory.Move(replaced.WebView, previousView);
            string newTable = WriteProfile(replaced.WebView, false);
            Directory.Move(redirected.WebView, Path.Combine(redirected.Data, "WebView.original"));
            string prepared = Path.Combine(root, @"staging\prepared-junction");
            Require((File.GetAttributes(prepared) & FileAttributes.ReparsePoint) != 0, "Fixture junction is missing.");
            Directory.Move(prepared, redirected.WebView);
            plan.BlockWebView(blocked.WebView);

            var report = engine.Apply(plan);
            foreach (string file in new[] { journal, snapshot, legacyJournal })
                Require(!File.Exists(file) && report.Lines.Any(line => line.Status == "removed" &&
                    SafePath.Comparer.Equals(line.Target, file)), "Expected a confirmed No-Vary-Search cache file to be removed.");
            foreach (string file in new[] { wrongHeader, wrongName, wrongFolder })
                Require(File.Exists(file) && report.Lines.Any(line => line.Status == "unchecked" &&
                    SafePath.Comparer.Equals(line.Target, file)), "A No-Vary-Search lookalike was not preserved and reported.");
            Require(File.Exists(mixedCache), "A No-Vary-Search cache in a mixed profile was changed.");
            Require(!Directory.Exists(clean.Data) && !File.Exists(clean.Config) &&
                !File.Exists(Path.Combine(clean.Install, "Pulse.exe")), "Expected verified profile and window INI to be removed.");
            Require(report.Lines.Any(line => line.Status == "removed" && SafePath.Comparer.Equals(line.Target, clean.Table)),
                "The deferred profile removal was not reported.");
            Require(File.Exists(mixed.Table) && report.Lines.Any(line => line.Status == "unchecked" &&
                SafePath.Comparer.Equals(line.Target, mixed.WebView)), "A locked mixed profile became a deletion target.");
            Require(File.Exists(newTable) && File.Exists(Path.Combine(previousView,
                @"EBWebView\Default\Local Storage\leveldb\000001.log")), "A replaced profile was changed.");
            Require(File.ReadAllText(Path.Combine(root, "guard", "canary.txt")) == "keep",
                "The profile junction target was changed.");
            Require(File.Exists(blocked.Table) && File.Exists(changed.Table) && File.Exists(changed.Config),
                "A blocked profile or changed data selection was acted on.");
            Console.WriteLine("PASS: deferred profile, window settings, mixed storage, replacement, junction and process/data gates");
            Console.WriteLine("PASS: exact No-Vary-Search cache names and format under a dedicated profile");
        }

        private static string WriteCacheFile(Specimen specimen, string relative, string name, params byte[] contents)
        {
            string directory = Path.Combine(specimen.WebView, relative);
            Directory.CreateDirectory(directory);
            string file = Path.Combine(directory, name);
            File.WriteAllBytes(file, contents);
            return file;
        }

        private static Specimen Create(string installs, string name, byte[] payload, byte[] loader, bool mixed)
        {
            string folder = Path.Combine(installs, name);
            string data = Path.Combine(folder, "Data");
            string webView = Path.Combine(data, "WebView");
            string config = Path.Combine(folder, "Pulse.ini");
            string table = WriteProfile(webView, mixed);
            File.WriteAllBytes(Path.Combine(folder, "Pulse.exe"), payload);
            File.WriteAllText(config, ProductFiles.IniHeader + Environment.NewLine + "data=" +
                data + Environment.NewLine + "tray=0" + Environment.NewLine);
            string dllDirectory = Path.Combine(data, @"bin\1.4.0");
            Directory.CreateDirectory(dllDirectory);
            File.WriteAllBytes(Path.Combine(dllDirectory, "WebView2Loader.dll"), loader);
            return new Specimen { Install = folder, Data = data, WebView = webView, Table = table, Config = config };
        }

        private static string WriteProfile(string root, bool mixed)
        {
            string edge = Path.Combine(root, "EBWebView");
            string profile = Path.Combine(edge, "Default");
            string level = Path.Combine(profile, @"Local Storage\leveldb");
            Directory.CreateDirectory(level);
            File.WriteAllText(Path.Combine(edge, "Local State"), "{\"profile\":{\"info_cache\":{\"Default\":{}}}}");
            File.WriteAllText(Path.Combine(profile, "Preferences"), "{\"profile\":{}}");
            string table = Path.Combine(level, "000001.log");
            string origins = "META:https://app.pulse.invalid\0";
            if (mixed) origins += "META:https://third-party.invalid\0";
            File.WriteAllText(table, origins, new UTF8Encoding(false));
            return table;
        }

        private static void Require(bool condition, string reason)
        {
            if (!condition) throw new InvalidOperationException(reason);
        }
    }
}
#endif
