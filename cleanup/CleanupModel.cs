using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Security;

namespace PulseCleanup
{
    internal sealed class ReportLine
    {
        internal readonly string Status, Category, Target, Detail;

        internal ReportLine(string status, string category, string target, string detail)
        {
            Status = status;
            Category = category;
            Target = target;
            Detail = detail;
        }
    }

    internal sealed class CleanupReport
    {
        private readonly List<ReportLine> lines = new List<ReportLine>();
        internal IEnumerable<ReportLine> Lines { get { return lines; } }
        internal bool Restart { get; private set; }
        internal bool Elevation { get; private set; }
        internal bool HasUnresolved { get { return lines.Any(row => row.Status == "remaining" || row.Status == "unchecked"); } }

        private void Add(string status, string category, string target, string detail)
        {
            lines.Add(new ReportLine(status, category, target, detail));
        }

        internal void Planned(string category, string target, string detail) { Add("planned", category, target, detail); }
        internal void Added(string category, string target, string detail) { Add("removed", category, target, detail); }
        internal void Remaining(string category, string target, string reason) { Add("remaining", category, target, reason); }
        internal void Unchecked(string category, string target, string reason) { Add("unchecked", category, target, reason); }
        internal void Preserved(string category, string target, string reason) { Add("preserved", category, target, reason); }
        internal void RestartMayHelp() { Restart = true; }
        internal void ElevationMayHelp() { Elevation = true; }

        internal void CopyIssuesFrom(CleanupReport source)
        {
            foreach (var line in source.Lines)
                if (line.Status == "unchecked" || line.Status == "preserved")
                    Add(line.Status, line.Category, line.Target, line.Detail);
            if (source.Elevation) ElevationMayHelp();
            if (source.Restart) RestartMayHelp();
        }

        internal static bool Expected(Exception error)
        {
            return error is IOException || error is UnauthorizedAccessException || error is SecurityException ||
                error is Win32Exception || error is NotSupportedException;
        }

        internal void DiscoveryFailed(string category, string target, Exception error)
        {
            if (SafePath.IsMissing(error)) return;
            Unchecked(category, target, ErrorText(error));
            Flag(error);
        }

        internal void Failed(string category, string target, Exception error)
        {
            if (SafePath.IsMissing(error)) return;
            Remaining(category, target, ErrorText(error));
            Flag(error);
        }

        private void Flag(Exception error)
        {
            var native = error as Win32Exception;
            if (error is UnauthorizedAccessException || error is SecurityException ||
                (native != null && (native.NativeErrorCode == 5 || native.NativeErrorCode == 1314)))
                ElevationMayHelp();
            if (native != null && (native.NativeErrorCode == 32 || native.NativeErrorCode == 33 ||
                native.NativeErrorCode == 1224))
                RestartMayHelp();
        }

        private static string ErrorText(Exception error)
        {
            var native = error as Win32Exception;
            if (native != null)
                return string.Format("{0} (Windows {1}).", native.Message.TrimEnd('.'), native.NativeErrorCode);
            return error.Message;
        }
    }

    internal sealed class IntegrationItem
    {
        internal readonly string Category, Target, Proof;
        internal readonly Action<CleanupReport> Apply;

        internal IntegrationItem(string category, string target, string proof, Action<CleanupReport> apply)
        {
            Category = category;
            Target = target;
            Proof = proof;
            Apply = apply;
        }
    }

    internal class FileWork
    {
        internal readonly string Category, Path, Proof, Hash;
        internal readonly FileStamp Stamp;
        internal readonly bool Directory;

        internal FileWork(string category, string path, string proof, FileStamp stamp, bool directory, string hash)
        {
            Category = category;
            Path = path;
            Proof = proof;
            Stamp = stamp;
            Directory = directory;
            Hash = hash;
        }

        internal PinnedPath Pin(bool delete)
        {
            var handle = SafePath.Open(Path, Directory, delete);
            bool correct = false;
            try
            {
                correct = Stamp.SameObject(handle.Stamp) &&
                    (Directory || (Stamp.Equals(handle.Stamp) && (Hash == null || Hash == handle.Sha256())));
                return correct ? handle : null;
            }
            finally { if (!correct) handle.Dispose(); }
        }
    }

    internal sealed class InstallWork
    {
        internal readonly string Folder;
        internal readonly List<FileWork> Images = new List<FileWork>();
        internal readonly List<FileWork> OtherFiles = new List<FileWork>();
        internal FileWork Config, EmptyInstallFolder;
        internal IDictionary<string, string> ConfigScope;
        internal readonly List<DataWork> Data = new List<DataWork>();
        internal bool UnverifiedData;

        internal InstallWork(string folder) { Folder = folder; }
    }

    internal sealed class DataWork
    {
        internal readonly string Path;
        internal readonly List<FileWork> Members = new List<FileWork>();
        internal readonly List<FileWork> Folders = new List<FileWork>();
        internal readonly HashSet<string> ProfileWitnesses = new HashSet<string>(SafePath.Comparer);
        internal FileWork DataRoot, ViewRoot, DataFolder, NativeLoader;
        internal string WebView;
        internal bool ProfileIncomplete, ViewVerifiedByLoader, ProfileDeferred, PrivateSibling;

        internal DataWork(string path) { Path = path; }
    }

    internal sealed class CleanupPlan
    {
        private readonly Dictionary<string, FileWork> applicationImages = new Dictionary<string, FileWork>(SafePath.Comparer);
        private readonly Dictionary<string, FileWork> confirmedImages = new Dictionary<string, FileWork>(SafePath.Comparer);
        private readonly HashSet<string> webViews = new HashSet<string>(SafePath.Comparer);
        private readonly HashSet<string> deferredWebViews = new HashSet<string>(SafePath.Comparer);
        private readonly HashSet<string> blockedImages = new HashSet<string>(SafePath.Comparer);
        private readonly HashSet<string> blockedWebViews = new HashSet<string>(SafePath.Comparer);
        internal readonly List<InstallWork> Installs = new List<InstallWork>();
        internal readonly List<FileWork> Updaters = new List<FileWork>();
        internal readonly IList<IntegrationItem> Integrations = new List<IntegrationItem>();
        internal readonly CleanupReport Preview = new CleanupReport();
        internal IEnumerable<string> Images { get { return confirmedImages.Keys; } }

        internal void AddImage(FileWork item, bool application)
        {
            confirmedImages.Add(item.Path, item);
            if (application) applicationImages.Add(item.Path, item);
        }

        internal void AddWebView(string path) { webViews.Add(path); }
        internal void AddDeferredWebView(string path) { deferredWebViews.Add(path); }

        internal bool ContainsImage(string path)
        {
            path = SafePath.Normalize(path);
            return path != null && confirmedImages.ContainsKey(path);
        }

        internal bool IsApplication(string path)
        {
            path = SafePath.Normalize(path);
            return path != null && applicationImages.ContainsKey(path);
        }

        internal bool ContainsWebView(string path)
        {
            path = SafePath.Normalize(path);
            return path != null && webViews.Contains(path);
        }

        internal bool ContainsDeferredWebView(string path)
        {
            path = SafePath.Normalize(path);
            return path != null && deferredWebViews.Contains(path);
        }

        internal PinnedPath PinImage(string path)
        {
            path = SafePath.Normalize(path);
            FileWork item;
            return path != null && confirmedImages.TryGetValue(path, out item) ? item.Pin(false) : null;
        }

        internal void BlockImage(string path)
        {
            path = SafePath.Normalize(path);
            if (path != null) blockedImages.Add(path);
        }

        internal void BlockWebView(string path)
        {
            path = SafePath.Normalize(path);
            if (path != null) blockedWebViews.Add(path);
        }

        internal bool IsImageBlocked(string path) { return blockedImages.Contains(path); }
        internal bool IsWebViewBlocked(string path) { return path != null && blockedWebViews.Contains(path); }
        internal bool HasWork { get { return confirmedImages.Count > 0 || Integrations.Count > 0; } }
    }
}
