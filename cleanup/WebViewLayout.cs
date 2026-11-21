using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace PulseCleanup
{
    internal static class WebViewLayout
    {
        private const string Profile = @"EBWebView\Default";
        private const string PulseIndexed = Profile + @"\IndexedDB\https_app.pulse.invalid_0.indexeddb";
        private const string GraphiteCache = @"EBWebView\GPUPersistentCache\DawnGraphiteCache";
        internal const string RuntimeReadmeHash = "A0C9ABAE18599F0A65FC654AD36251F6330794BEA66B718A09D8B297F3E38E87";
        private static readonly StringComparer Comparer = SafePath.Comparer;
        private static readonly string[] ProfileDirectories = {
            "AutofillAiModelCache", "AutofillStrikeDatabase", "blob_storage", "BudgetDatabase", "Cache",
            @"Cache\Cache_Data", @"Cache\No_Vary_Search", "ClientCertificates",
            "Code Cache", @"Code Cache\js", @"Code Cache\js\index-dir", @"Code Cache\wasm", @"Code Cache\wasm\index-dir",
            "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "Extension Rules", "Extension State",
            "discount_infos_db", "discounts_db", "EdgeEDrop", "EdgeHubAppUsage", "EdgeSessions", "Extension Scripts",
            "Feature Engagement Tracker",
            @"Feature Engagement Tracker\AvailabilityDB",
            @"Feature Engagement Tracker\EventDB", "GPUCache", "GCM Store", @"GCM Store\Encryption",
            "IndexedDB", "JumpListIconsRecentWorkspacesV2", "Local Storage", @"Local Storage\leveldb", "Network", "Platform Notifications",
            "Safe Browsing Network", "Service Worker", @"Service Worker\Database",
            @"Service Worker\CacheStorage", @"Service Worker\ScriptCache", @"Service Worker\ScriptCache\index-dir",
            "Session Storage", "Sessions", "Sessions_Encrypted", "Shared Dictionary", @"Shared Dictionary\cache",
            @"Shared Dictionary\cache\index-dir", "Site Characteristics Database", "Sync Data", @"Sync Data\LevelDB",
            "VideoDecodeStats", "WebStorage", "WebRTC Logs", "commerce_subscription_db", "parcel_tracking_db",
            "optimization_guide_hint_cache_store", "optimization_guide_model_and_features_store",
            "shared_proto_db", @"shared_proto_db\metadata", "Segmentation Platform", "File System", @"File System\Origins",
            "Download Service", @"Download Service\EntryDB", @"Download Service\Files",
            "DIPS", "PersistentOriginTrials", "Storage", @"Storage\ext"
        };
        private static readonly string[] LevelDbProfileDirectories = {
            "AutofillAiModelCache", "AutofillStrikeDatabase", "BudgetDatabase", "ClientCertificates",
            "discount_infos_db", "discounts_db", @"Download Service\EntryDB",
            "Extension Rules", "Extension State", "Extension Scripts",
            @"Feature Engagement Tracker\AvailabilityDB", @"Feature Engagement Tracker\EventDB", "GCM Store",
            @"GCM Store\Encryption", @"Local Storage\leveldb", @"Service Worker\Database", "Session Storage",
            "Site Characteristics Database", @"Sync Data\LevelDB", "VideoDecodeStats", "commerce_subscription_db",
            "parcel_tracking_db", "optimization_guide_hint_cache_store", "optimization_guide_model_and_features_store",
            "shared_proto_db", @"shared_proto_db\metadata", @"File System\Origins", "PersistentOriginTrials"
        };
        private static readonly HashSet<string> RootDirectories = new HashSet<string>(new[] {
            "EBWebView", Profile, @"EBWebView\Crashpad", @"EBWebView\Crashpad\reports", @"EBWebView\Crashpad\pending",
            @"EBWebView\Crashpad\completed", @"EBWebView\Crashpad\attachments", @"EBWebView\GrShaderCache",
            @"EBWebView\GraphiteDawnCache", @"EBWebView\ShaderCache", @"EBWebView\component_crx_cache",
            @"EBWebView\SafetyTips", @"EBWebView\TrustTokenKeyCommitments", @"EBWebView\BrowserMetrics",
            @"EBWebView\BrowserMetrics-spare", @"EBWebView\Subresource Filter", @"EBWebView\PKIMetadata",
            @"EBWebView\AutoLaunchProtocolsComponent", @"EBWebView\CertificateRevocation", @"EBWebView\GPUPersistentCache",
            GraphiteCache, @"EBWebView\hyphen-data", @"EBWebView\MEIPreload", @"EBWebView\OriginTrials",
            @"EBWebView\Speech Recognition", @"EBWebView\Subresource Filter\Unindexed Rules",
            @"EBWebView\Trust Protection Lists", @"EBWebView\WidevineCdm",
            PulseIndexed + ".leveldb", PulseIndexed + ".blob"
        }, Comparer);
        private static readonly HashSet<string> UpperFiles = new HashSet<string>(new[] {
            "Local State", "First Run", "Last Version", "Last Browser", "Variations", "BrowserMetrics-active.pma",
            "chrome_shutdown_ms.txt", "SingletonCookie", "SingletonLock", "SingletonSocket", "CrashpadMetrics-active.pma",
            "WebView2Metrics.pma", "VariationsSeedV1", "VariationsSeedV2", "VariationsRuntimeSeedV2",
            "VariationsSafeSeedV2", "Breadcrumbs", "lockfile"
        }, Comparer);
        private static readonly HashSet<string> DefaultFiles = new HashSet<string>(new[] {
            "Preferences", "Secure Preferences", "Account Web Data", "Affiliation Database", "AutofillStates",
            "Bookmarks", "Bookmarks.bak", "Cookies", "DIPS", "Extension Cookies", "Favicons", "History",
            "InterestGroups", "Login Data", "Login Data For Account", "Media History", "Network Action Predictor",
            "Network Persistent State", "Reporting and NEL", "SharedStorage", "Shortcuts", "Top Sites",
            "TransportSecurity", "Trust Tokens", "Visited Links", "Web Data", "Web Data For Account",
            "QuotaManager", "LOCK", "LOG", "LOG.old", "Current Session", "Current Tabs",
            "Last Session", "Last Tabs", "SyncData.sqlite3", "DownloadMetadata", "heavy_ad_intervention_opt_out.db",
            "BookmarkMergedSurfaceOrdering", "declarative_performance_observer.db", "ExtensionActivityComp",
            "ExtensionActivityEdge", "favorites_diagnostic.log", "settings_diagnostic.log", "PreferredApps",
            "ServerCertificate", "Vpn Tokens"
        }, Comparer);
        private static readonly HashSet<string> NetworkFiles = new HashSet<string>(new[] {
            "Device Bound Sessions", "ServerCertificate", "Vpn Tokens", "Safe Browsing Cookies"
        }, Comparer);
        private static readonly HashSet<string> CacheProfileDirectories = new HashSet<string>(new[] {
            "Cache", @"Cache\Cache_Data", @"Code Cache\js", @"Code Cache\js\index-dir", @"Code Cache\wasm",
            @"Code Cache\wasm\index-dir", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "GPUCache",
            @"Service Worker\ScriptCache", @"Service Worker\ScriptCache\index-dir",
            @"Shared Dictionary\cache", @"Shared Dictionary\cache\index-dir"
        }, Comparer);
        private static readonly Regex LevelTables = Rule(@"^(?:[0-9]{1,12}\.(log|ldb|sst|tmp)|MANIFEST-[0-9]{1,12})$");
        private static readonly Regex CacheFiles = Rule(@"^(data_[0-9]+|f_[0-9a-f]{6,16}|[0-9a-f]{16}(?:_[0-9]+|_s)?)$");
        private static readonly Regex SessionFile = Rule(@"^(Session|Tabs)_[0-9]+$");
        private static readonly Regex BlobName = Rule(@"^(?:[0-9a-f]{2,40}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$");
        private static readonly Regex ReportName = Rule(@"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(dmp|meta)$");
        private static readonly Regex MetricsName = Rule(@"^(?:BrowserMetrics|CrashpadMetrics|WebView2Metrics)[-_][0-9a-f-]+\.pma$");
        private static readonly Regex GraphiteKey = Rule(@"^[A-Z2-7]{32}$");

        internal static bool Directory(string relative)
        {
            if (RootDirectories.Contains(relative)) return true;
            string inside = UnderProfile(relative);
            if (inside != null && Array.Exists(ProfileDirectories, value => Comparer.Equals(value, inside))) return true;
            return GraphiteDirectory(relative) || UnderOwnBucket(relative) || DynamicPath(relative, Profile + @"\blob_storage", 2) ||
                DynamicPath(relative, Profile + @"\Service Worker\CacheStorage", 4);
        }

        internal static bool File(string parent, string name)
        {
            if (parent.Length == 0)
                return Comparer.Equals(name, "WebView2ActiveState") || Comparer.Equals(name, "WebView2Loader.log");
            if (Comparer.Equals(parent, "EBWebView"))
                return UpperFiles.Contains(name) || IsWithJournal(name, "first_party_sets.db") || MetricsName.IsMatch(name);
            if (GraphiteDirectory(parent))
                return Comparer.Equals(name, "cache.db") || Comparer.Equals(name, "cache.db-wal") ||
                    Comparer.Equals(name, "cache.db-shm") || Comparer.Equals(name, "cache.journal");
            if (Comparer.Equals(parent, PulseIndexed + ".leveldb")) return LevelDb(name);
            if (UnderOwnBucket(parent) || Comparer.Equals(parent, PulseIndexed + ".blob"))
                return BlobName.IsMatch(name);
            string inside = UnderProfile(parent);
            if (inside == "")
                return IsRuntimeReadme(parent, name) || IsWithJournal(DefaultFiles, name);
            if (inside != null)
            {
                if (Array.Exists(LevelDbProfileDirectories, value => Comparer.Equals(value, inside))) return LevelDb(name);
                if (CacheProfileDirectories.Contains(inside)) return IsCache(name);
                if (Comparer.Equals(inside, @"Cache\Cache_Data") && Comparer.Equals(name, "index")) return true;
                if (Comparer.Equals(inside, "Network") || Comparer.Equals(inside, "Safe Browsing Network"))
                    return IsWithJournal(DefaultFiles, name) || IsWithJournal(NetworkFiles, name) ||
                        Comparer.Equals(name, "NetworkDataMigrated") || Comparer.Equals(name, "SCT Auditing Pending Reports") ||
                        Comparer.Equals(name, "Sdch Dictionaries");
                if (Comparer.Equals(inside, "Sessions") || Comparer.Equals(inside, "Sessions_Encrypted")) return SessionFile.IsMatch(name);
                if (Comparer.Equals(inside, "EdgeSessions")) return Comparer.Equals(name, "SessionRestoreLog");
                if (Comparer.Equals(inside, "EdgeEDrop")) return IsWithJournal(name, "EdgeEDropSQLite.db");
                if (Comparer.Equals(inside, "EdgeHubAppUsage")) return IsWithJournal(name, "EdgeHubAppUsageSQLite.db");
                if (Comparer.Equals(inside, "Shared Dictionary"))
                    return IsWithJournal(name, "db");
                if (Comparer.Equals(inside, "WebStorage")) return IsWithJournal(DefaultFiles, name);
                if (Comparer.Equals(inside, "Segmentation Platform")) return LevelDb(name) || IsWithJournal(DefaultFiles, name);
                if (Comparer.Equals(inside, "DIPS")) return LevelDb(name) || IsWithJournal(DefaultFiles, name);
                if (DynamicPath(parent, Profile + @"\blob_storage", 2)) return BlobName.IsMatch(name);
                if (DynamicPath(parent, Profile + @"\Service Worker\CacheStorage", 4))
                    return IsCache(name) || Comparer.Equals(name, "index.txt");
                return false;
            }
            if (Comparer.Equals(parent, @"EBWebView\GrShaderCache") || Comparer.Equals(parent, @"EBWebView\ShaderCache") ||
                Comparer.Equals(parent, @"EBWebView\GraphiteDawnCache")) return IsCache(name);
            if (Comparer.Equals(parent, @"EBWebView\Crashpad"))
                return Comparer.Equals(name, "settings.dat") || Comparer.Equals(name, "metadata") ||
                    Comparer.Equals(name, "throttle_store.dat");
            if (parent.StartsWith(@"EBWebView\Crashpad\", StringComparison.OrdinalIgnoreCase)) return ReportName.IsMatch(name);
            if (Comparer.Equals(parent, @"EBWebView\BrowserMetrics") ||
                Comparer.Equals(parent, @"EBWebView\BrowserMetrics-spare")) return MetricsName.IsMatch(name);
            return false;
        }

        internal static bool LevelDbData(string name)
        {
            return LevelTables.IsMatch(name);
        }

        internal static bool IsRuntimeReadme(string parent, string name)
        {
            return Comparer.Equals(parent, Profile) && Comparer.Equals(name, "README");
        }

        private static bool LevelDb(string name)
        {
            return Comparer.Equals(name, "CURRENT") || Comparer.Equals(name, "LOCK") ||
                Comparer.Equals(name, "LOG") || Comparer.Equals(name, "LOG.old") || LevelDbData(name);
        }

        private static bool IsCache(string name)
        {
            return Comparer.Equals(name, "index") || Comparer.Equals(name, "the-real-index") ||
                Comparer.Equals(name, "temp-index") || CacheFiles.IsMatch(name);
        }

        private static bool IsWithJournal(HashSet<string> names, string name)
        {
            if (names.Contains(name)) return true;
            foreach (string suffix in new[] { "-journal", "-wal", "-shm" })
                if (name.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) &&
                    names.Contains(name.Substring(0, name.Length - suffix.Length))) return true;
            return false;
        }

        private static bool IsWithJournal(string name, string stem)
        {
            return Comparer.Equals(name, stem) || Comparer.Equals(name, stem + "-journal") ||
                Comparer.Equals(name, stem + "-wal") || Comparer.Equals(name, stem + "-shm");
        }

        private static bool UnderOwnBucket(string path) { return DynamicPath(path, PulseIndexed + ".blob", 4); }

        private static bool GraphiteDirectory(string path)
        {
            return path.StartsWith(GraphiteCache + "\\", StringComparison.OrdinalIgnoreCase) &&
                GraphiteKey.IsMatch(path.Substring(GraphiteCache.Length + 1));
        }

        private static bool DynamicPath(string path, string root, int depth)
        {
            if (!path.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase)) return false;
            string[] parts = path.Substring(root.Length + 1).Split('\\');
            return parts.Length <= depth && Array.TrueForAll(parts, part => BlobName.IsMatch(part));
        }

        private static string UnderProfile(string relative)
        {
            if (Comparer.Equals(relative, Profile)) return "";
            return relative.StartsWith(Profile + "\\", StringComparison.OrdinalIgnoreCase)
                ? relative.Substring(Profile.Length + 1) : null;
        }

        private static Regex Rule(string expression)
        {
            return new Regex(expression, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        }
    }
}
