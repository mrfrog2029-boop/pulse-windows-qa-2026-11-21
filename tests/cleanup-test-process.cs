#if INDEPENDENT_WEBVIEW
using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class BrowserFixture
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        using (var window = new Form { Text = "Independent WebView2 QA" })
        using (var browser = new WebView2 { Dock = DockStyle.Fill })
        {
            window.Controls.Add(browser);
            window.Shown += async delegate
            {
                try
                {
                    string profile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "WebView");
                    var environment = await CoreWebView2Environment.CreateAsync(null, profile);
                    await browser.EnsureCoreWebView2Async(environment);
                    browser.Source = new Uri("about:blank");
                }
                catch
                {
                    Environment.ExitCode = 1;
                    window.Close();
                }
            };
            Application.Run(window);
        }
    }
}
#else
using System.Reflection;
using System.Threading;

[assembly: AssemblyTitle("Pulse")]
[assembly: AssemblyProduct("Pulse")]
[assembly: AssemblyCompany("exepcstudio")]
[assembly: AssemblyVersion("1.4.0.0")]
[assembly: AssemblyFileVersion("1.4.0.0")]

internal static class Program
{
    private static void Main()
    {
#if UNRELATED
        Thread.Sleep(599000);
#else
        Thread.Sleep(600000);
#endif
    }
}
#endif
