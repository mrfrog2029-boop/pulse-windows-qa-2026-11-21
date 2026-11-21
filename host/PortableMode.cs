using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

namespace Pulse
{
    internal static class PortableMode
    {
        private static string scope;

        internal static string DataDirectory { get; private set; }
        internal static bool Active { get { return scope != null; } }

        internal static bool Requested(string[] arguments)
        {
            return Array.IndexOf(arguments, "--portable") >= 0;
        }

        internal static bool CanReadConfig(string executable)
        {
            try
            {
                var directory = new DirectoryInfo(Path.GetDirectoryName(Path.GetFullPath(executable)));
                for (var ancestor = directory; ancestor != null; ancestor = ancestor.Parent)
                    if (IsReparsePoint(ancestor.Attributes))
                        return false;

                var configuration = Path.Combine(directory.FullName, "Pulse.ini");
                return File.Exists(configuration) && !IsReparsePoint(File.GetAttributes(configuration));
            }
            catch (Exception error)
            {
                if (!IsPathError(error))
                    throw;
                return false;
            }
        }

        internal static bool Configure(string[] arguments, string marker, string data, string executable)
        {
            if (!Requested(arguments))
                return marker != "1";

            if (marker != "1" || String.IsNullOrWhiteSpace(data)
                || Array.IndexOf(arguments, "--install") >= 0
                || Array.IndexOf(arguments, "--uninstall") >= 0
                || Array.IndexOf(arguments, "--hidden") >= 0)
                return false;

            try
            {
                var root = Path.GetPathRoot(data);
                if (root == null || root.Length != 3 || root[1] != ':')
                    return false;

                var actual = Path.GetFullPath(data).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                var expected = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(executable)), "Data");
                if (!String.Equals(actual, expected, StringComparison.OrdinalIgnoreCase) || !IsLocalDataTree(expected))
                    return false;

                using (var sha = SHA256.Create())
                {
                    var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(expected.ToUpperInvariant()));
                    scope = BitConverter.ToString(hash).Replace("-", String.Empty);
                }

                DataDirectory = expected;
                Environment.SetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER", Path.Combine(expected, "WebView"));
                return true;
            }
            catch (Exception error)
            {
                if (!IsPathError(error))
                    throw;
                return false;
            }
        }

        internal static string ObjectName(string name)
        {
            return Active ? name + ".portable." + scope : name;
        }

        internal static void ShowCleanupMessage()
        {
            MessageBox.Show("Для полного удаления запустите «Полное удаление Pulse» из папки поставки.",
                "Удаление Pulse", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private static bool IsLocalDataTree(string data)
        {
            FileAttributes attributes;
            try
            {
                attributes = File.GetAttributes(data);
            }
            catch (FileNotFoundException)
            {
                return true;
            }
            catch (DirectoryNotFoundException)
            {
                return true;
            }

            if (IsReparsePoint(attributes) || (attributes & FileAttributes.Directory) == 0)
                return false;

            var directories = new Stack<string>();
            directories.Push(data);
            while (directories.Count != 0)
            {
                foreach (var path in Directory.EnumerateFileSystemEntries(directories.Pop()))
                {
                    attributes = File.GetAttributes(path);
                    if (IsReparsePoint(attributes))
                        return false;
                    if ((attributes & FileAttributes.Directory) != 0)
                        directories.Push(path);
                }
            }

            return true;
        }

        private static bool IsReparsePoint(FileAttributes attributes)
        {
            return (attributes & FileAttributes.ReparsePoint) != 0;
        }

        private static bool IsPathError(Exception error)
        {
            return error is IOException || error is UnauthorizedAccessException || error is ArgumentException
                || error is NotSupportedException || error is System.Security.SecurityException;
        }
    }
}
