using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;

namespace PulseCleanup
{
    internal struct FileStamp : IEquatable<FileStamp>
    {
        internal readonly uint Volume;
        internal readonly ulong Id;
        internal readonly long Created, Written, Changed, Size;
        internal readonly uint Attributes, Links;

        internal FileStamp(uint volume, ulong id, long created, long written, long changed,
            long size, uint attributes, uint links)
        {
            Volume = volume;
            Id = id;
            Created = created;
            Written = written;
            Changed = changed;
            Size = size;
            Attributes = attributes;
            Links = links;
        }

        internal bool SameObject(FileStamp other)
        {
            return Volume == other.Volume && Id == other.Id && Created == other.Created;
        }

        public bool Equals(FileStamp other)
        {
            return SameObject(other) && Written == other.Written && Changed == other.Changed &&
                Size == other.Size && Attributes == other.Attributes && Links == other.Links;
        }

        public override bool Equals(object other)
        {
            return other is FileStamp && Equals((FileStamp)other);
        }

        public override int GetHashCode()
        {
            return Id.GetHashCode() ^ Volume.GetHashCode();
        }
    }

    internal sealed class DirectoryEntry
    {
        internal readonly string Name;
        internal readonly bool Directory, Reparse;

        internal DirectoryEntry(string name, uint attributes)
        {
            Name = name;
            Directory = (attributes & SafePath.DirectoryAttribute) != 0;
            Reparse = (attributes & SafePath.ReparseAttribute) != 0;
        }
    }

    internal sealed class PinnedPath : IDisposable
    {
        private readonly List<SafeFileHandle> handles;
        private readonly bool directory, deleteAccess;
        internal readonly SafeFileHandle Handle;
        internal readonly FileStamp Stamp;
        internal readonly string Path;

        internal PinnedPath(string path, bool directory, bool deleteAccess,
            List<SafeFileHandle> handles, FileStamp stamp)
        {
            Path = path;
            this.handles = handles;
            this.directory = directory;
            this.deleteAccess = deleteAccess;
            Handle = handles[handles.Count - 1];
            Stamp = stamp;
        }

        internal IList<DirectoryEntry> Entries(int limit)
        {
            if (!directory) throw new InvalidOperationException("Требуется каталог.");
            SafePath.CheckHandle(Handle, Path, true);
            return SafePath.ReadDirectory(Handle, limit);
        }

        internal FileStream Read()
        {
            if (directory) throw new InvalidOperationException("Требуется файл.");
            return SafePath.ReadStream(Handle);
        }

        internal string Sha256()
        {
            using (var stream = Read())
            using (var hash = SHA256.Create())
                return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "");
        }

        internal void Delete()
        {
            if (!deleteAccess) throw new InvalidOperationException("Требуется файловый дескриптор с правом удаления.");
            SafePath.CheckHandle(Handle, Path, directory);
            CheckDelete();
            SafePath.MarkForDeletion(Handle);
        }

        internal void CheckDelete()
        {
            if ((Stamp.Attributes & 1) != 0) throw new IOException("Объект отмечен атрибутом «только чтение».");
            if (SafePath.HasAlternateStreams(Handle))
                throw new IOException("Объект имеет пользовательские альтернативные потоки и сохранён.");
        }

        public void Dispose()
        {
            for (int i = handles.Count - 1; i >= 0; i--) handles[i].Dispose();
        }
    }

    internal static class SafePath
    {
        private const uint ReadData = 0x1, ReadAttributes = 0x80, Synchronize = 0x100000, DeleteAccess = 0x10000;
        private const uint ShareRead = 0x1, ShareWrite = 0x2, ShareDelete = 0x4;
        private const uint NtFileOpen = 1, NtSynchronous = 0x20, NtDirectory = 0x1, NtNonDirectory = 0x40;
        private const uint NtOpenReparse = 0x00200000, NtObjectCaseInsensitive = 0x40;
        private const uint BackupSemantics = 0x02000000;
        internal const uint DirectoryAttribute = 0x10, ReparseAttribute = 0x400;
        private const uint OfflineAttribute = 0x1000, RecallOnOpen = 0x40000, RecallOnDataAccess = 0x400000;
        private const int FileBasicInfo = 0, FileDispositionInfo = 4, FileIdBothDirectoryInfo = 10,
            FileIdBothDirectoryRestartInfo = 11, FileStreamInfo = 7;
        private const int NtFileCaseSensitiveInformation = 71;
        private const int ErrorNoMoreFiles = 18, ErrorHandleEof = 38;
        private static readonly Regex ReservedName = new Regex(
            @"^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        internal static readonly StringComparer Comparer = StringComparer.OrdinalIgnoreCase;

        internal static bool IsSafeName(string part)
        {
            if (string.IsNullOrEmpty(part) || part.Length > 255 ||
                part.EndsWith(".", StringComparison.Ordinal) || part.EndsWith(" ", StringComparison.Ordinal) ||
                ReservedName.IsMatch(part)) return false;
            foreach (char c in part)
                if (c < ' ' || "<>:\"/\\|?*".IndexOf(c) >= 0) return false;
            return true;
        }

        internal static string Normalize(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return null;
            path = path.Replace('/', '\\');
            if (path.Length < 3 || path[1] != ':' || path[2] != '\\' || path.Length >= 32000) return null;
            char drive = char.ToUpperInvariant(path[0]);
            if (drive < 'A' || drive > 'Z') return null;
            string relative = path.Substring(3).TrimEnd('\\');
            if (relative.Length != 0)
                foreach (string part in relative.Split('\\'))
                    if (!IsSafeName(part)) return null;
            return drive + @":\" + relative;
        }

        internal static bool IsBelow(string path, string root)
        {
            if (path == null || root == null || Comparer.Equals(path, root)) return false;
            string prefix = root.EndsWith("\\", StringComparison.Ordinal) ? root : root + "\\";
            return path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
        }

        internal static bool IsMissing(Exception error)
        {
            var native = error as Win32Exception;
            return (native != null && (native.NativeErrorCode == 2 || native.NativeErrorCode == 3)) ||
                error is FileNotFoundException || error is DirectoryNotFoundException;
        }

        internal static PinnedPath Open(string path, bool directory, bool deleteAccess)
        {
            return OpenCore(path, directory, deleteAccess, false);
        }

        internal static PinnedPath ProbeFile(string path)
        {
            return OpenCore(path, false, false, true);
        }

        internal static PinnedPath OpenRuntimeImageEvidence(string path)
        {
            path = Normalize(path);
            if (path == null || !Comparer.Equals(Path.GetFileName(path), "msedgewebview2.exe"))
                throw new IOException("Путь не указывает на ожидаемый образ WebView2.");
            // Evergreen can hard-link the runtime to EdgeCore. This handle is only
            // used to pin evidence about a process image and has no delete access.
            return OpenCore(path, false, false, false, true);
        }

        private static PinnedPath OpenCore(string path, bool directory, bool deleteAccess, bool probeFile,
            bool allowLinkedRuntime = false)
        {
            path = Normalize(path);
            if (path == null || (path.Length == 3 && (!directory || deleteAccess)))
                throw new IOException("Путь находится вне поддерживаемой локальной области.");
            string root = path.Substring(0, 3);
            uint driveType = GetDriveType(root);
            if (driveType != 2 && driveType != 3)
                throw new IOException("Требуется локальный том NTFS.");
            var handles = new List<SafeFileHandle>();
            try
            {
                var volume = CreateFile(@"\\?\" + root, ReadData | ReadAttributes | Synchronize, ShareRead, IntPtr.Zero, 3,
                    BackupSemantics | NtOpenReparse, IntPtr.Zero);
                if (volume.IsInvalid)
                {
                    var error = LastError();
                    volume.Dispose();
                    throw error;
                }
                handles.Add(volume);
                var fs = new StringBuilder(32);
                uint serial, maxName, flags;
                if (!GetVolumeInformationByHandle(volume, null, 0, out serial, out maxName, out flags, fs, fs.Capacity))
                    throw LastError();
                if (!Comparer.Equals(fs.ToString(), "NTFS")) throw new IOException("Требуется локальный том NTFS.");
                FileStamp stamp = CheckHandle(volume, root, true);
                string prefix = root;
                string[] parts = path.Length == 3 ? new string[0] : path.Substring(3).Split('\\');
                for (int i = 0; i < parts.Length; i++)
                {
                    bool last = i == parts.Length - 1;
                    bool partDirectory = !last || directory;
                    var handle = OpenRelative(handles[handles.Count - 1], parts[i], partDirectory,
                        last && deleteAccess, last && probeFile);
                    handles.Add(handle);
                    prefix = prefix.Length == 3 ? prefix + parts[i] : prefix + "\\" + parts[i];
                    stamp = CheckHandle(handle, prefix, partDirectory, last && allowLinkedRuntime);
                }
                return new PinnedPath(path, directory, deleteAccess, handles, stamp);
            }
            catch
            {
                for (int i = handles.Count - 1; i >= 0; i--) handles[i].Dispose();
                throw;
            }
        }

        private static SafeFileHandle OpenRelative(SafeFileHandle parent, string name, bool directory,
            bool deleteAccess, bool probeFile)
        {
            var chars = Marshal.StringToHGlobalUni(name);
            IntPtr unicodeName = IntPtr.Zero;
            try
            {
                var unicode = new UnicodeString {
                    Length = (ushort)(name.Length * 2), MaximumLength = (ushort)((name.Length + 1) * 2), Buffer = chars
                };
                unicodeName = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString)));
                Marshal.StructureToPtr(unicode, unicodeName, false);
                var attributes = new ObjectAttributes {
                    Length = Marshal.SizeOf(typeof(ObjectAttributes)), RootDirectory = parent.DangerousGetHandle(),
                    ObjectName = unicodeName, Attributes = NtObjectCaseInsensitive
                };
                uint desired = ReadAttributes | Synchronize;
                if (!probeFile) desired |= ReadData;
                if (deleteAccess) desired |= DeleteAccess;
                uint share = probeFile ? ShareRead | ShareWrite | ShareDelete : ShareRead;
                uint options = NtSynchronous | NtOpenReparse | (directory ? NtDirectory : NtNonDirectory);
                IoStatusBlock io;
                IntPtr raw;
                int status = NtCreateFile(out raw, desired, ref attributes, out io, IntPtr.Zero,
                    0, share, NtFileOpen, options, IntPtr.Zero, 0);
                GC.KeepAlive(parent);
                if (status < 0) throw new Win32Exception(unchecked((int)RtlNtStatusToDosError(status)));
                if (raw == IntPtr.Zero || raw == new IntPtr(-1)) throw new IOException("Windows не открыла файловый объект.");
                return new SafeFileHandle(raw, true);
            }
            finally
            {
                if (unicodeName != IntPtr.Zero) Marshal.FreeHGlobal(unicodeName);
                Marshal.FreeHGlobal(chars);
            }
        }

        internal static FileStamp CheckHandle(SafeFileHandle handle, string path, bool directory,
            bool allowLinkedRuntime = false)
        {
            ByHandle info;
            if (!GetFileInformationByHandle(handle, out info)) throw LastError();
            if ((info.Attributes & (ReparseAttribute | OfflineAttribute | RecallOnOpen | RecallOnDataAccess)) != 0)
                throw new IOException("Точка перенаправления или облачный объект пропущены.");
            if (directory != ((info.Attributes & DirectoryAttribute) != 0))
                throw new IOException("Тип файлового объекта изменился.");
            if (directory)
            {
                IoStatusBlock io;
                uint caseFlags;
                int status = NtQueryInformationFile(handle, out io, out caseFlags, sizeof(uint), NtFileCaseSensitiveInformation);
                if (status < 0) throw new Win32Exception(unchecked((int)RtlNtStatusToDosError(status)));
                if (caseFlags != 0) throw new IOException("Каталог с учётом регистра имени пропущен.");
            }
            if (!directory && (info.Links == 0 || (!allowLinkedRuntime && info.Links != 1)))
                throw new IOException("Файл с несколькими жёсткими ссылками пропущен.");
            var name = new StringBuilder(Math.Max(260, path.Length + 8));
            uint got = GetFinalPathNameByHandle(handle, name, name.Capacity, 0);
            if (got == 0) throw LastError();
            if (got >= name.Capacity || !Comparer.Equals(name.ToString(), @"\\?\" + path))
                throw new IOException("Физический путь отличается от выбранного, объект пропущен.");
            BasicInfo basic;
            if (!GetFileInformationByHandleEx(handle, FileBasicInfo, out basic, Marshal.SizeOf(typeof(BasicInfo))))
                throw LastError();
            return new FileStamp(info.Volume, ((ulong)info.IdHigh << 32) | info.IdLow,
                basic.Created, basic.Written, basic.Changed,
                (long)(((ulong)info.SizeHigh << 32) | info.SizeLow), info.Attributes, info.Links);
        }

        internal static bool HasAlternateStreams(SafeFileHandle handle)
        {
            const int bufferSize = 65536;
            IntPtr buffer = Marshal.AllocHGlobal(bufferSize);
            try
            {
                if (!GetFileInformationByHandleEx(handle, FileStreamInfo, buffer, bufferSize))
                {
                    var error = LastError();
                    if (error.NativeErrorCode == ErrorHandleEof) return false;
                    throw error;
                }
                int offset = 0;
                while (true)
                {
                    int next = Marshal.ReadInt32(buffer, offset);
                    int bytes = Marshal.ReadInt32(buffer, offset + 4);
                    if (bytes < 0 || (bytes & 1) != 0 || bytes > bufferSize - offset - 24)
                        throw new IOException("Windows вернула некорректные сведения о потоках файла.");
                    string name = Marshal.PtrToStringUni(IntPtr.Add(buffer, offset + 24), bytes / 2);
                    if (!Comparer.Equals(name, "::$DATA") && !Comparer.Equals(name, ":Zone.Identifier:$DATA")) return true;
                    if (next == 0) return false;
                    if (next < 24 || next > bufferSize - offset - 24)
                        throw new IOException("Windows вернула некорректный список потоков файла.");
                    offset += next;
                }
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        internal static FileStream ReadStream(SafeFileHandle original)
        {
            SafeFileHandle copy;
            var process = GetCurrentProcess();
            if (!DuplicateHandle(process, original, process, out copy, 0, false, 2)) throw LastError();
            try
            {
                var stream = new FileStream(copy, FileAccess.Read);
                stream.Position = 0;
                return stream;
            }
            catch { copy.Dispose(); throw; }
        }

        internal static IList<DirectoryEntry> ReadDirectory(SafeFileHandle handle, int limit)
        {
            const int nameOffset = 104, bufferSize = 65536;
            IntPtr buffer = Marshal.AllocHGlobal(bufferSize);
            try
            {
                var result = new List<DirectoryEntry>();
                int informationClass = FileIdBothDirectoryRestartInfo;
                while (true)
                {
                    if (!GetFileInformationByHandleEx(handle, informationClass, buffer, bufferSize))
                    {
                        var error = LastError();
                        if (error.NativeErrorCode == ErrorNoMoreFiles) return result;
                        throw error;
                    }
                    informationClass = FileIdBothDirectoryInfo;
                    int offset = 0;
                    while (true)
                    {
                        int next = Marshal.ReadInt32(buffer, offset);
                        uint attributes = unchecked((uint)Marshal.ReadInt32(buffer, offset + 56));
                        int bytes = Marshal.ReadInt32(buffer, offset + 60);
                        if (bytes < 0 || (bytes & 1) != 0 || bytes > bufferSize - offset - nameOffset)
                            throw new IOException("Windows вернула некорректные сведения об имени файла.");
                        string name = Marshal.PtrToStringUni(IntPtr.Add(buffer, offset + nameOffset), bytes / 2);
                        if (name != "." && name != "..") result.Add(new DirectoryEntry(name, attributes));
                        if (result.Count > limit) throw new IOException("Достигнут предел числа записей в каталоге.");
                        if (next == 0) break;
                        if (next < nameOffset || next > bufferSize - offset - nameOffset)
                            throw new IOException("Windows вернула некорректное содержимое каталога.");
                        offset += next;
                    }
                }
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        internal static void MarkForDeletion(SafeFileHandle handle)
        {
            byte delete = 1;
            if (!SetFileInformationByHandle(handle, FileDispositionInfo, ref delete, 1)) throw LastError();
        }

        private static Win32Exception LastError() { return new Win32Exception(Marshal.GetLastWin32Error()); }

        [StructLayout(LayoutKind.Sequential)]
        private struct ObjectAttributes
        {
            public int Length;
            public IntPtr RootDirectory, ObjectName;
            public uint Attributes;
            public IntPtr SecurityDescriptor, SecurityQualityOfService;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct UnicodeString
        {
            public ushort Length, MaximumLength;
            public IntPtr Buffer;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IoStatusBlock
        {
            public IntPtr Status, Information;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ByHandle
        {
            public uint Attributes, CreatedLow, CreatedHigh, AccessedLow, AccessedHigh, WrittenLow, WrittenHigh,
                Volume, SizeHigh, SizeLow, Links, IdHigh, IdLow;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BasicInfo
        {
            public long Created, Accessed, Written, Changed;
            public uint Attributes;
        }

        [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(string name, uint access, uint share,
            IntPtr security, uint action, uint flags, IntPtr template);

        [DllImport("kernel32.dll", EntryPoint = "GetDriveTypeW", CharSet = CharSet.Unicode)]
        private static extern uint GetDriveType(string path);

        [DllImport("kernel32.dll", EntryPoint = "GetVolumeInformationByHandleW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool GetVolumeInformationByHandle(SafeFileHandle handle, StringBuilder name, int nameSize,
            out uint serial, out uint maxName, out uint flags, StringBuilder fileSystem, int fileSystemSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out ByHandle info);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int informationClass,
            out BasicInfo info, int bytes);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int informationClass,
            IntPtr buffer, int bytes);

        [DllImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder name, int capacity, uint flags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetFileInformationByHandle(SafeFileHandle handle, int informationClass,
            ref byte buffer, int bytes);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DuplicateHandle(IntPtr source, SafeFileHandle handle, IntPtr target,
            out SafeFileHandle copy, uint desired, bool inheritable, uint options);

        [DllImport("ntdll.dll")]
        private static extern int NtCreateFile(out IntPtr handle, uint desired, ref ObjectAttributes attributes,
            out IoStatusBlock status, IntPtr allocation, uint fileAttributes, uint share,
            uint disposition, uint options, IntPtr ea, uint eaLength);

        [DllImport("ntdll.dll")]
        private static extern int NtQueryInformationFile(SafeFileHandle handle, out IoStatusBlock status,
            out uint information, uint length, int informationClass);

        [DllImport("ntdll.dll")]
        private static extern uint RtlNtStatusToDosError(int status);
    }
}
