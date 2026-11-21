using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Xml;

namespace PulseCleanup
{
    internal static class WindowsIntegrationTests
    {
        internal static void Run()
        {
            CommandTargets();
            BrowserAncestry();
            ProcessImageAge();
            ObservedBrowserExit();
            BrowserProfilePath();
            TaskActions();
            MissingTaskResults();
        }

        private static void ProcessImageAge()
        {
            var persisted = new FileStamp(1, 2, 80, 90, 95, 1, 0, 1);
            var copiedLater = new FileStamp(1, 3, 110, 90, 115, 1, 0, 1);
            var modifiedLater = new FileStamp(1, 2, 80, 110, 115, 1, 0, 1);
            Equal(true, WindowsIntegration.ImageAtLaunch(persisted, 100), "image predates process");
            Equal(false, WindowsIntegration.ImageAtLaunch(copiedLater, 100), "new file at the process image path");
            Equal(false, WindowsIntegration.ImageAtLaunch(modifiedLater, 100), "changed image at the process path");
        }

        private static void ObservedBrowserExit()
        {
            var report = new CleanupReport();
            var child = new WindowsIntegration.ObservedProcess
            {
                Id = 42,
                Image = @"C:\Synthetic\msedgewebview2.exe",
                Browser = true
            };
            Equal(false, WindowsIntegration.ReportObservedBrowserExit(child, 258, report), "waiting child remains active");
            Equal(false, WindowsIntegration.ReportObservedBrowserExit(child, uint.MaxValue, report), "failed wait does not confirm exit");
            Equal(true, WindowsIntegration.ReportObservedBrowserExit(child, 0, report), "signaled native handle confirms exit");
            var lines = new List<ReportLine>(report.Lines);
            Equal(1, lines.Count, "only the confirmed child is reported as finished");
            Equal(child.Label, lines[0].Target, "the exit report identifies the observed child");
        }

        private static void BrowserProfilePath()
        {
            const string outer = @"C:\Pulse\Data\WebView";
            Func<string, bool> recognized = path => string.Equals(path, outer, StringComparison.OrdinalIgnoreCase);
            Equal(outer, WindowsIntegration.RecognizedBrowserProfile(outer, recognized), "configured WebView profile");
            Equal(outer, WindowsIntegration.RecognizedBrowserProfile(outer + @"\EBWebView", recognized), "runtime's immediate WebView profile");
            Equal(null, WindowsIntegration.RecognizedBrowserProfile(outer + @"\Unknown\EBWebView", recognized),
                "an unrelated deeper profile does not match");
            Equal(null, WindowsIntegration.RecognizedBrowserProfile(outer + @"\EBWebView\Default", recognized),
                "a profile's descendant is not the runtime's user data directory");
            Equal(null, WindowsIntegration.RecognizedBrowserProfile(@"C:\Other\Data\WebView\EBWebView", recognized),
                "runtime path does not prove another installation");
        }

        private static void Equal(object expected, object actual, string message)
        {
            if (!object.Equals(expected, actual))
                throw new InvalidOperationException(message + " (expected " + expected + ", got " + actual + ")");
        }

        private static void CommandTargets()
        {
            const string spaced = @"C:\Program Files\Pulse\Pulse.exe";
            const string simple = @"C:\Pulse\Pulse.exe";
            Equal(spaced, WindowsIntegration.DirectCommandImage("\"" + spaced + "\" --update"), "quoted direct image");
            Equal(simple, WindowsIntegration.DirectCommandImage(simple + " /update"), "unquoted direct image");
            Equal(simple, WindowsIntegration.DirectCommandImage(simple + " --settings %UNRELATED_VARIABLE%"),
                "unresolved argument does not affect the direct image");
            Equal(null, WindowsIntegration.DirectCommandImage(spaced + " /update"), "ambiguous executable token");
            Equal(null, WindowsIntegration.DirectCommandImage("\"" + simple + "\"unexpected"), "malformed closing quote");
            Equal(null, WindowsIntegration.DirectCommandImage(@"cmd.exe /c " + simple), "relative wrapper");
            Equal(@"C:\Windows\System32\cmd.exe",
                WindowsIntegration.DirectCommandImage(@"C:\Windows\System32\cmd.exe /c " + simple),
                "absolute wrapper never transfers ownership to its arguments");
            Equal(null, WindowsIntegration.DirectCommandImage(@"\\server\share\Pulse.exe"), "UNC target");
            Equal(null, WindowsIntegration.DirectCommandImage(@"Pulse.exe"), "relative executable");
            Equal(null, WindowsIntegration.DirectCommandImage("\"" + simple + "\\\""), "trailing path separator");
            Equal(spaced, WindowsIntegration.DisplayIconImage("\"" + spaced + "\",-1"), "quoted icon target");
            Equal(spaced, WindowsIntegration.DisplayIconImage(spaced + ",0"), "unquoted icon target");
            Equal(null, WindowsIntegration.DisplayIconImage(simple + ",text"), "invalid icon index");
            Equal(@"C:\Archive,2026\Pulse.exe", WindowsIntegration.DisplayIconImage(@"C:\Archive,2026\Pulse.exe"),
                "comma within an icon path");
        }

        private static void BrowserAncestry()
        {
            var owner = new WindowsIntegration.ObservedProcess { Id = 10, Created = 100, Session = 1 };
            var browser = new WindowsIntegration.ObservedProcess { Id = 11, Parent = 10, Created = 110, Session = 1, Browser = true };
            var child = new WindowsIntegration.ObservedProcess { Id = 12, Parent = 11, Created = 120, Session = 1, Browser = true };
            var unrelated = new WindowsIntegration.ObservedProcess { Id = 13, Parent = 12, Created = 130, Session = 1 };
            var snapshot = new Dictionary<int, WindowsIntegration.ObservedProcess>
            {
                { owner.Id, owner }, { browser.Id, browser }, { child.Id, child }, { unrelated.Id, unrelated }
            };
            var owners = new HashSet<int> { owner.Id };
            Equal(true, WindowsIntegration.IsBrowserChild(browser, snapshot, owners), "direct browser child");
            Equal(true, WindowsIntegration.IsBrowserChild(child, snapshot, owners), "nested browser child");
            Equal(false, WindowsIntegration.IsBrowserChild(unrelated, snapshot, owners), "unverified executable");
            owner.Created = 115;
            Equal(false, WindowsIntegration.IsBrowserChild(child, snapshot, owners), "reused parent PID");
            owner.Created = 100;
            owner.Session = 2;
            Equal(false, WindowsIntegration.IsBrowserChild(child, snapshot, owners), "unrelated session");
            owner.Session = 1;
            browser.Browser = false;
            Equal(false, WindowsIntegration.IsBrowserChild(child, snapshot, owners), "unverified intermediary");
            browser.Browser = true;
            owners.Clear();
            Equal(false, WindowsIntegration.IsBrowserChild(child, snapshot, owners), "no verified Pulse ancestor");
        }

        private static void TaskActions()
        {
            const string prefix = "<Task xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\"><Actions>";
            const string suffix = "</Actions></Task>";
            const string spaced = @"C:\Program Files\Pulse\Pulse.exe";
            const string wrapper = @"C:\Windows\System32\cmd.exe";
            string[] targets = WindowsIntegration.TaskImages(prefix
                + "<Exec><Command>" + spaced + "</Command></Exec>"
                + "<Exec><Command>" + wrapper + "</Command><Arguments>/c " + spaced + "</Arguments></Exec>"
                + "<ComHandler><ClassId>example</ClassId></ComHandler>" + suffix);
            Equal(3, targets.Length, "each task action is represented");
            Equal(spaced, targets[0], "task Command is a distinct path field");
            Equal(wrapper, targets[1], "task arguments do not establish executable ownership");
            Equal(null, targets[2], "COM handlers do not establish executable ownership");
            targets = WindowsIntegration.TaskImages(prefix + "<Exec><Command>" + spaced
                + "</Command><Command>" + wrapper + "</Command></Exec>" + suffix);
            Equal(null, targets[0], "ambiguous duplicate command");
            bool blocked = false;
            try { WindowsIntegration.TaskImages("<!DOCTYPE Task [<!ENTITY item \"outside\">]>" + prefix + suffix); }
            catch (XmlException) { blocked = true; }
            Equal(true, blocked, "task parser rejects a document type");
        }

        private static void MissingTaskResults()
        {
            const int missingFile = unchecked((int)0x80070002);
            const int missingFolder = unchecked((int)0x80070003);
            const int denied = unchecked((int)0x80070005);
            Equal(true, WindowsIntegration.MissingTask(Marshal.GetExceptionForHR(missingFile)), "native missing task maps to managed file-not-found");
            Equal(true, WindowsIntegration.MissingTask(Marshal.GetExceptionForHR(missingFolder)), "native missing folder maps to managed directory-not-found");
            Equal(true, WindowsIntegration.MissingTask(new COMException("missing", missingFile)), "raw COM missing task");
            Equal(false, WindowsIntegration.MissingTask(Marshal.GetExceptionForHR(denied)), "access denial is not successful absence");
        }
    }
}
