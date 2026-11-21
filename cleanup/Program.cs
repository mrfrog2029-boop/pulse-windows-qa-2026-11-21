using System;
using System.Drawing;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Полное удаление Pulse")]
[assembly: System.Reflection.AssemblyDescription("Интерактивное удаление Pulse и его локальных данных")]
[assembly: System.Reflection.AssemblyCompany("exepcstudio")]
[assembly: System.Reflection.AssemblyProduct("Pulse-Cleanup")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.0.0.0")]

namespace PulseCleanup
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
#if TEST_FIXTURES
            return FixtureRunner.Run(args);
#else
            if (args.Length != 0) return 2;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool first;
            using (var gate = new Mutex(true, @"Local\exepcstudio.Pulse.Cleanup", out first))
            {
                if (!first)
                {
                    MessageBox.Show("Уже открыто окно полного удаления Pulse.", "Полное удаление Pulse");
                    return 1;
                }
                using (var window = new CleanupWindow(Application.ExecutablePath))
                    Application.Run(window);
            }
            return 0;
#endif
        }
    }

#if !TEST_FIXTURES
    internal sealed class CleanupWindow : Form
    {
        private readonly CleanupEngine engine;
        private readonly System.Collections.Generic.HashSet<string> folders = new System.Collections.Generic.HashSet<string>(SafePath.Comparer);
        private readonly System.Collections.Generic.HashSet<string> images = new System.Collections.Generic.HashSet<string>(SafePath.Comparer);
        private readonly DataGridView list = new DataGridView();
        private readonly Label status = new Label();
        private readonly Button scan = new Button(), addFolder = new Button(), addImage = new Button(),
            remove = new Button(), close = new Button(), copy = new Button();
        private readonly CheckBox consent = new CheckBox();
        private bool busy;
        private CleanupPlan plan;
        private CleanupReport shown;

        internal CleanupWindow(string executable)
        {
            engine = new CleanupEngine(executable);
            Text = "Полное удаление Pulse";
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(1000, 626);
            MinimumSize = new Size(760, 510);
            Font = new Font("Segoe UI", 9);
            var layout = new TableLayoutPanel {
                Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 7, Padding = new Padding(18)
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int i = 0; i < 7; i++)
                layout.RowStyles.Add(i == 3 ? new RowStyle(SizeType.Percent, 100) : new RowStyle(SizeType.AutoSize));
            Controls.Add(layout);

            var heading = new Label {
                Text = Text, AutoSize = true, Font = new Font("Segoe UI", 20, FontStyle.Bold),
                Margin = new Padding(0, 0, 0, 6)
            };
            var warning = new Label {
                Dock = DockStyle.Fill, AutoSize = true, Margin = new Padding(0, 0, 0, 12),
                Text = "При очистке удаляются локальные аккаунты, ключи, сессии и настройки. Восстановление через утилиту невозможно.\r\n" +
                    "Аккаунты и события на удалённых службах и relay остаются там."
            };
            var tools = ButtonRow();
            Configure(scan, "Повторить поиск", async (s, e) => await Search());
            Configure(addFolder, "Добавить папку…", ChooseFolder);
            Configure(addImage, "Добавить EXE…", ChooseImage);
            Configure(copy, "Скопировать отчёт", CopyReport);
            tools.Controls.AddRange(new Control[] { scan, addFolder, addImage, copy });

            list.Dock = DockStyle.Fill;
            list.ReadOnly = true;
            list.MultiSelect = false;
            list.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            list.RowHeadersVisible = false;
            list.AllowUserToAddRows = false;
            list.AllowUserToDeleteRows = false;
            list.AllowUserToResizeRows = false;
            list.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            list.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
            list.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.DisplayedCells;
            list.BackgroundColor = SystemColors.Window;
            list.BorderStyle = BorderStyle.FixedSingle;
            AddColumn("Состояние", 17, 98);
            AddColumn("Область", 19, 105);
            AddColumn("Объект", 37, 155);
            AddColumn("Основание или причина", 36, 155);
            list.AccessibleName = "Предпросмотр и результат очистки";
            list.Margin = new Padding(0, 5, 0, 9);

            status.AutoSize = true;
            status.Dock = DockStyle.Fill;
            status.Margin = new Padding(0, 0, 0, 6);
            consent.Text = "Подтверждаю безвозвратное удаление перечисленных локальных данных и ключей";
            consent.AutoSize = true;
            consent.Margin = new Padding(0, 0, 0, 9);
            consent.CheckedChanged += (s, e) => UpdateButtons();

            var actions = ButtonRow();
            actions.FlowDirection = FlowDirection.RightToLeft;
            Configure(close, "Закрыть", (s, e) => Close());
            Configure(remove, "Полностью удалить Pulse", async (s, e) => await Remove());
            actions.Controls.AddRange(new Control[] { close, remove });
            CancelButton = close;
            layout.Controls.Add(heading, 0, 0);
            layout.Controls.Add(warning, 0, 1);
            layout.Controls.Add(tools, 0, 2);
            layout.Controls.Add(list, 0, 3);
            layout.Controls.Add(status, 0, 4);
            layout.Controls.Add(consent, 0, 5);
            layout.Controls.Add(actions, 0, 6);
            Shown += async (s, e) => await Search();
            FormClosing += (s, e) => { if (busy) e.Cancel = true; };
            UpdateButtons();
        }

        private static FlowLayoutPanel ButtonRow()
        {
            return new FlowLayoutPanel {
                Dock = DockStyle.Fill, AutoSize = true, WrapContents = false,
                Margin = new Padding(0), Padding = new Padding(0)
            };
        }

        private static void Configure(Button button, string caption, EventHandler action)
        {
            button.Text = caption;
            button.AutoSize = true;
            button.Padding = new Padding(7, 2, 7, 2);
            button.Click += action;
        }

        private void AddColumn(string title, int fill, int minimum)
        {
            list.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = title, FillWeight = fill, MinimumWidth = minimum });
        }

        private void UpdateButtons()
        {
            scan.Enabled = addFolder.Enabled = addImage.Enabled = close.Enabled = !busy;
            copy.Enabled = !busy && shown != null;
            consent.Enabled = !busy && plan != null && plan.HasWork;
            remove.Enabled = consent.Enabled && consent.Checked;
            UseWaitCursor = busy;
        }

        private async Task Search()
        {
            if (busy) return;
            string[] chosenFolders = folders.ToArray(), chosenImages = images.ToArray();
            busy = true;
            plan = null;
            shown = null;
            list.Rows.Clear();
            consent.Checked = false;
            status.Text = "Идёт поиск Pulse и его следов…";
            UpdateButtons();
            try
            {
                plan = await Task.Run(() => engine.Discover(chosenFolders, chosenImages));
                ShowReport(plan.Preview);
                status.Text = plan.HasWork
                    ? "Проверьте найденные экземпляры и отмеченные области перед удалением."
                    : "В проверенных областях принадлежность компонентов Pulse не подтверждена.";
                AppendFlags(plan.Preview);
            }
            catch (Exception error)
            {
                status.Text = "Поиск прерван. " + error.Message;
            }
            finally { busy = false; UpdateButtons(); }
        }

        private async void ChooseFolder(object sender, EventArgs args)
        {
            using (var picker = new FolderBrowserDialog {
                Description = "Выберите папку, в которой искать переносимые копии Pulse.", ShowNewFolderButton = false
            })
            {
                if (picker.ShowDialog(this) != DialogResult.OK) return;
                folders.Add(picker.SelectedPath);
            }
            await Search();
        }

        private async void ChooseImage(object sender, EventArgs args)
        {
            using (var picker = new OpenFileDialog {
                Title = "Выберите файл Pulse или старый updater", Filter = "Приложения Windows (*.exe)|*.exe",
                CheckFileExists = true, Multiselect = true, RestoreDirectory = true, DereferenceLinks = false
            })
            {
                if (picker.ShowDialog(this) != DialogResult.OK) return;
                foreach (string path in picker.FileNames) images.Add(path);
            }
            await Search();
        }

        private async Task Remove()
        {
            if (busy || plan == null || !plan.HasWork || !consent.Checked) return;
            var answer = MessageBox.Show(this,
                "Подтвердите удаление показанных компонентов Pulse, в том числе локальных ключей и настроек.\r\n\r\n" +
                "Для очистки могут быть закрыты работающие экземпляры Pulse и принадлежащие им процессы.",
                Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
            if (answer != DialogResult.Yes) return;
            CleanupPlan selected = plan;
            busy = true;
            consent.Checked = false;
            plan = null;
            status.Text = "Выполняется удаление подтверждённых компонентов Pulse…";
            UpdateButtons();
            try
            {
                var report = await Task.Run(() => engine.Apply(selected));
                ShowReport(report);
                int done = report.Lines.Count(line => line.Status == "removed");
                status.Text = "Выполнено действий: " + done + (report.HasUnresolved
                    ? ". Проверьте остатки и непроверенные области."
                    : ". Проверьте итоговый список.") + " Сам файл утилиты можно удалить после закрытия.";
                AppendFlags(report);
            }
            catch (Exception error) { status.Text = "Очистка прервана. Повторите поиск. " + error.Message; }
            finally { busy = false; UpdateButtons(); }
        }

        private void AppendFlags(CleanupReport report)
        {
            if (report.Elevation) status.Text += " Для недоступных областей запустите утилиту от имени администратора.";
            if (report.Restart) status.Text += " Для занятых файлов может понадобиться перезагрузка и повторный поиск.";
        }

        private void ShowReport(CleanupReport report)
        {
            list.SuspendLayout();
            try
            {
                list.Rows.Clear();
                foreach (var line in report.Lines)
                    list.Rows.Add(StatusLabel(line.Status), line.Category, line.Target, line.Detail);
                list.ClearSelection();
            }
            finally { list.ResumeLayout(); }
            shown = report;
        }

        private void CopyReport(object sender, EventArgs args)
        {
            if (shown == null) return;
            string content = string.Join(Environment.NewLine, shown.Lines.Select(line =>
                string.Join("\t", StatusLabel(line.Status), line.Category, line.Target, line.Detail)));
            if (content.Length > 0)
                Clipboard.SetText(status.Text + Environment.NewLine + content);
        }

        private static string StatusLabel(string status)
        {
            switch (status)
            {
                case "planned": return "К удалению";
                case "removed": return "Выполнено";
                case "remaining": return "Осталось";
                case "unchecked": return "Не проверено";
                default: return "Сохранено";
            }
        }
    }
#endif
}
