using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;

internal static class PulseDesktop
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size;
        public string Reserved, Desktop, Title;
        public uint X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
        public ushort ShowWindow, ReservedCount;
        public IntPtr ReservedPointer, Input, Output, Error;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo
    {
        public IntPtr Process, Thread;
        public uint Id, ThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobLimits
    {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr WorkingSetMin, WorkingSetMax;
        public uint ProcessLimit;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr state);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devMode,
        uint flags, uint access, IntPtr attributes);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool CloseDesktop(IntPtr desktop);

    [DllImport("user32.dll")]
    private static extern bool EnumDesktopWindows(IntPtr desktop, EnumWindowsProc handler, IntPtr state);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string image, StringBuilder command, IntPtr processAttributes,
        IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string cwd,
        ref StartupInfo startup, out ProcessInfo process);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref int size);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int kind, ref JobLimits limits, uint bytes);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exit);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    private static void Required(bool success, string operation)
    {
        if (!success) throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }

    public static int Main(string[] args)
    {
        try
        {
            bool inheritDesktop = args.Length == 2 && args[1] == "--inherit-desktop" &&
                Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == "true" &&
                Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") == "github-hosted";
            if (args.Length != 1 && !inheritDesktop) throw new ArgumentException("Expected the disposable Pulse.exe path.");
            string image = Path.GetFullPath(args[0]);
            if (!string.Equals(Path.GetFileName(image), "Pulse.exe", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("Expected a Pulse.exe image.");
            Run(image, inheritDesktop);
            return 0;
        }
        catch (Win32Exception error)
        {
            Console.Error.WriteLine("Desktop launcher: {0} ({1})", error.Message, error.NativeErrorCode);
            return 1;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Desktop launcher: {0}", error.GetType().Name);
            return 1;
        }
    }

    private static void Run(string image, bool inheritDesktop)
    {
        string name = null;
        IntPtr desktop = IntPtr.Zero;
        if (!inheritDesktop)
        {
            name = "PulseQa_" + Guid.NewGuid().ToString("N");
            desktop = CreateDesktop(name, IntPtr.Zero, IntPtr.Zero, 0, 0x1ff, IntPtr.Zero);
            Required(desktop != IntPtr.Zero, "CreateDesktop");
        }
        IntPtr job = IntPtr.Zero;
        ProcessInfo child = new ProcessInfo();
        bool assigned = false;
        try
        {
            job = CreateJobObject(IntPtr.Zero, null);
            Required(job != IntPtr.Zero, "CreateJobObject");
            var limits = new JobLimits { Flags = 0x2000 }; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            Required(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(JobLimits))),
                "SetInformationJobObject");

            var startup = new StartupInfo { Size = Marshal.SizeOf(typeof(StartupInfo)), Desktop = name };
            var command = new StringBuilder("\"" + image + "\" --portable --devtools");
            Required(CreateProcess(image, command, IntPtr.Zero, IntPtr.Zero, false, 4, IntPtr.Zero,
                Path.GetDirectoryName(image), ref startup, out child), "CreateProcess");
            Required(AssignProcessToJobObject(job, child.Process), "AssignProcessToJobObject");
            assigned = true;
            int size = 32768;
            var actualImage = new StringBuilder(size);
            Required(QueryFullProcessImageName(child.Process, 0, actualImage, ref size), "QueryFullProcessImageName");
            if (!string.Equals(actualImage.ToString(), image, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The launched image was not the disposable file.");
            Required(ResumeThread(child.Thread) != uint.MaxValue, "ResumeThread");
            string browserArgs = Environment.GetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") ?? "";
            Console.WriteLine("CDP_ARGUMENT_IN_LAUNCHER={0}", browserArgs.Contains("--remote-debugging-port=") ? "yes" : "no");
            Console.WriteLine("PULSE_PID={0}", child.Id);
            Console.Out.Flush();

            var stopSignal = Task.Run(() => Console.ReadLine());
            while (!stopSignal.IsCompleted)
            {
                uint wait = WaitForSingleObject(child.Process, 100);
                if (wait == 0) return;
                Required(wait == 258, "WaitForSingleObject");
            }

            EnumDesktopWindows(desktop, delegate(IntPtr window, IntPtr state)
            {
                uint owner;
                GetWindowThreadProcessId(window, out owner);
                if (owner == child.Id) PostMessage(window, 0x10, IntPtr.Zero, IntPtr.Zero); // WM_CLOSE
                return true;
            }, IntPtr.Zero);
            if (WaitForSingleObject(child.Process, 5000) == 0)
                Console.WriteLine("CLOSE=graceful");
            else
                Console.WriteLine("CLOSE=job");
        }
        finally
        {
            if (!assigned && child.Process != IntPtr.Zero) TerminateProcess(child.Process, 1);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (child.Process != IntPtr.Zero)
            {
                WaitForSingleObject(child.Process, 5000);
                CloseHandle(child.Process);
            }
            if (child.Thread != IntPtr.Zero) CloseHandle(child.Thread);
            if (desktop != IntPtr.Zero) CloseDesktop(desktop);
        }
    }
}
