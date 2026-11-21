using System;
using System.Runtime.InteropServices;
using System.Text;

public static class HostedCleanupUi
{
    private const uint GetText = 0x000d;
    private const uint ButtonClick = 0x00f5;

    public static IntPtr Window(int pid, string title, bool dialog)
    {
        IntPtr result = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr unused)
        {
            uint actualPid;
            GetWindowThreadProcessId(window, out actualPid);
            if (actualPid != (uint)pid || !IsWindowVisible(window))
                return true;
            var className = new StringBuilder(256);
            GetClassName(window, className, className.Capacity);
            if ((className.ToString() == "#32770") != dialog || Text(window) != title)
                return true;
            result = window;
            return false;
        }, IntPtr.Zero);
        return result;
    }

    public static IntPtr Child(IntPtr parent, string text)
    {
        IntPtr result = IntPtr.Zero;
        EnumChildWindows(parent, delegate(IntPtr window, IntPtr unused)
        {
            if (Text(window) != text) return true;
            result = window;
            return false;
        }, IntPtr.Zero);
        return result;
    }

    public static void Click(IntPtr button)
    {
        if (button == IntPtr.Zero || !IsWindowEnabled(button))
            throw new InvalidOperationException("A cleanup control could not be invoked.");
        SetForegroundWindow(GetAncestor(button, 2));
        if (!PostMessage(button, ButtonClick, IntPtr.Zero, IntPtr.Zero))
            throw new InvalidOperationException("A cleanup control could not be invoked.");
    }

    public static void Confirm(IntPtr dialog)
    {
        SetForegroundWindow(dialog);
        Click(GetDlgItem(dialog, 6));
    }

    private static string Text(IntPtr window)
    {
        var text = new StringBuilder(4096);
        IntPtr result;
        SendMessageTimeout(window, GetText, (IntPtr)text.Capacity, text, 2, 150, out result);
        return text.ToString();
    }

    private delegate bool WindowVisitor(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(WindowVisitor visitor, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, WindowVisitor visitor, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    public static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder name, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wparam,
        StringBuilder text, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")]
    private static extern IntPtr GetDlgItem(IntPtr window, int id);
    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
}
