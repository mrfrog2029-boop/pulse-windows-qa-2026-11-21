# Приёмка Pulse в двух клиентских средах

На одном Windows-хосте тест запускает две побайтно одинаковые копии выпускаемого `Pulse.exe`. Для каждой он создаёт отдельный Win32 desktop, процесс и каталог WebView2. Проверяет исходный путь процесса, совпадение SHA-256 копии с релизом, каталог `--user-data-dir`, родной WebView2 bridge и независимость тестовых записей в `localStorage` и `sessionStorage`. Тестовые аккаунты, профили и пароли создаются заново для прогона. В локальном прогоне трафик каталога, presence и комнат через WebView2 направляется на WSS loopback. Нативный мост сохраняет штатную проверку часов через Cloudflare. Публичный прогон использует релеи из приложения и обычную проверку TLS. Обе копии на одном хосте разделяют физическую сеть, часы и версию WebView2. Микрофон синтетический.

Ответы WebView2 проверяются на штатном `https://app.pulse.invalid`, включая `Cache-Control`, MIME, идентификатор сборки и SHA-256 загруженных ресурсов. Набор байтов для сравнения извлекается из именованного managed-ресурса `web.zip` через Reflection Only. После входа и входа в комнату дополнительно проверяются записи загрузки модулей в Resource Timing. У двух процессов проверяются разные каталоги профилей и отдельные сессии. [Документация WebView2 об отладке по CDP](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code)

В loopback-прогоне отдельный relay обслуживает `REQ`, `EVENT`, `OK`, `EOSE`, `CLOSE` и `CLOSED` по WSS. Он проверяет структуру и SHA-256 идентификатора событий, учитывает сроки и адресуемые события. Подлинность входящих событий проверяет клиент Pulse. Тест подсчитывает согласованные topics по одному реальному коду комнаты и выводит только булев результат и счётчики. Испытание сетевого разрыва закрывает реальные сокеты, подтверждает их повторное открытие и перезапускает гостевой Pulse.exe. Публичный тест использует обычную политику WebRTC. Для loopback режим `relay-only` отключает прямые ICE-пути при сохранении реального WSS. [NIP‑01](https://github.com/nostr-protocol/nips/blob/master/01.md)

## Повтор проверки в PowerShell

Команды выполняются из папки Pulse на Windows x64. Нужны Node.js, Edge WebView2 Runtime, компилятор `.NET Framework` и OpenSSL. Компилятор и OpenSSL из Git for Windows определяются по обычным путям. При другом расположении передайте `--csc` и `--openssl`. Базовый браузерный прогон использует установленный Edge, путь можно передать через `--edge`.

```powershell
$deps = Join-Path $env:TEMP 'Pulse-Acceptance-Deps-20261120'
npm install --prefix $deps --ignore-scripts --no-audit --no-fund playwright-core@1.65.1 ws@8.23.0

$baselineWeb = Join-Path $env:TEMP ('PulseBaselineWeb-' + [guid]::NewGuid().ToString('N'))
$activeWeb = Join-Path $env:TEMP ('PulseReleaseWeb-' + [guid]::NewGuid().ToString('N'))
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/exe-unpack.ps1 -Exe baseline/Pulse.exe -Destination $baselineWeb
$pulseSha = powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tests/exe-unpack.ps1 -Exe release/Pulse.exe -Destination $activeWeb

node tests/exe-acceptance.mjs --baseline-web $baselineWeb --deps $deps --transport relay-only --report test-runs/exe/baseline-loopback.json
node tests/exe-acceptance.mjs --exe release/Pulse.exe --sha256 $pulseSha --web $activeWeb --legacy-web $baselineWeb --deps $deps --transport relay-only --report test-runs/exe/release-loopback.json
node tests/exe-acceptance.mjs --exe release/Pulse.exe --sha256 $pulseSha --web $activeWeb --deps $deps --mode public --live --timeout 45 --report test-runs/exe/release-public.json
```

На изолированном GitHub Windows runner, после отдельного успешного прогона штатного `Pulse-Cleanup.exe` через `tests/cleanup-hosted.ps1`, команда повторяет сценарии на тех же очищенных путях A и B. Перед установкой проверяются отсутствие старых `Pulse.exe` и `Data`. Файл отчёта следует сохранять и при коде возврата 1.

```powershell
$cleanedInstalls = Join-Path $env:RUNNER_TEMP 'pulse-cleanup-hosted/installs'
node tests/exe-acceptance.mjs --exe release/Pulse.exe --sha256 $pulseSha --web $activeWeb --deps $deps --transport relay-only --post-clean-installs $cleanedInstalls --report test-runs/exe/hosted-post-clean.json
```

## Проверка исходной версии и старых данных

- SHA-256 исходного `Pulse.exe` — `A25F33E71364BE8CC1E6FAE56210D4A354F87D1ADF29752562667513FCCF4005`. SHA-256 активного managed ZIP — `878A94908A5433C145A3BBE895921F653EB4EC7F1FC6D1205645C5A8FAAABAE7`.
- В исходной .NET-оболочке `Program.Main` создаёт общие на Windows-сеанс объекты `Local\exepcstudio.Pulse.instance` и `Local\exepcstudio.Pulse.show`, а обработчик `setSystem` может изменять `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Pulse`. Исходные сетевые сценарии выполнялись в двух отдельных браузерных средах с байтами активного ZIP. Сюда входят loopback и настоящие публичные релеи.
- Для проверки старых данных тест открывает извлечённый исходный ZIP в двух чистых WebView2-профилях портативной нативной оболочки. Через интерфейс создаёт два аккаунта, дружбу и сохранённую конфигурацию relay. Затем закрывает оба процесса, запускает штатный интерфейс нового релиза из EXE с теми же каталогами и сверяет сохранённые разные ID, связь и настройки. Профили создаются штатной логикой старой веб-версии. Проверено обновление представленного ZIP и повторное использование прежнего профиля WebView2.

## Результаты сборки `71446d0e81b0c49e`

SHA-256 проверенного `release/Pulse.exe` — `B872AB95A79364BA9F944DBE3D06204A470A90E9FB7749FBD794BA87959DEC8B`. Loopback-прогон `0d66ad530f` и публичный прогон `3decfdfa53` завершились с кодом 0. В обоих подтверждены метка сборки, совпадение байтов проверенных ресурсов и фактическая загрузка room-relay, room-voice и SDK в WebView2 `Edg/157.0.4341.60`. [Loopback](exe-release-loopback.json), [публичные relay](exe-release-public.json)

| Критерий | Loopback, два EXE | Публичные relay, два EXE | Доказательство |
| --- | --- | --- | --- |
| 1. Поиск существующего @ника | PASS | PASS | A и B нашли друг друга через точный запрос с нормализацией регистра. |
| 2. Отсутствие записи и технический отказ | PASS | PASS для отсутствия записи. Управляемый отказ BLOCKED | Пустой запрос с `EOSE` дал «никого не нашли», `CLOSED` локального relay дал сообщение о сбое каталога. |
| 3. Присутствие | PASS | PASS | Оба клиента приняли новую дружбу и показали друг друга online. |
| 4. Выход и вход | PASS | PASS | A показал B offline после выхода и online после входа. Loopback зафиксировал подписанное событие с адресом `pulse-presence-offline`. |
| 5. A создаёт комнату, B входит | PASS | PASS | Два участника у каждого, текст в обе стороны и общий topic. |
| 6. B создаёт комнату, A входит | PASS | PASS | Те же результаты при обратных ролях. В loopback прямой ICE отключён и соединение через него отсутствовало. |
| 7. Неверный код | PASS | PASS | Отклонены неверный формат и новый синтаксически корректный код без открытой комнаты. Представление комнаты осталось закрытым. |
| 8. Разрыв и перезапуск | PASS | BLOCKED | Сокеты закрыты и открыты снова. После нового PID гостя оба снова увидели друг друга и обменялись текстом. Принудительный разрыв выполнен на подконтрольном relay. |
| 9. Чистые и прежние данные | PASS | PASS для чистых профилей | В loopback два профиля со старыми ID, дружбой и relay открылись после смены загруженных ресурсов при новой WebView-сессии. После этого оба вошли в одну комнату и обменялись текстом. |
| 10. После полного удаления | PASS на hosted Windows Server 2022 | Публичные relay проверены отдельным прогоном | Штатный очиститель удалил оба старых `Pulse.exe` и оба `Data`. Две новые копии в тех же каталогах прошли проверки 1–8, включая перезапуск. |

В исходном loopback-прогоне встречный @поиск и online после принятия дружбы прошли на том же сетевом контуре. Явный offline после выхода не появился в 20-секундном окне. B не увидел A в списке участников в обеих расстановках ролей при недоступном прямом ICE. Случайный код корректного формата открыл представление пустой комнаты. Эти три сценария повторены на финальном EXE с результатом PASS. [Исходный loopback](exe-baseline-loopback.json)

Пять публичных Nostr relay подтвердили события обоих тестовых профилей и события обеих комнат. В исходящих кадрах проверены адресаты зашифрованной почты и признаки открытого текста. Счётчики внешних адресатов и обнаруженных открытых паролей, кодов, названий и сообщений равны нулю. В обоих публичных клиентах зафиксировано по одной ошибке WebSocket к `wss.vdo.ninja`. Нативный прогон подтверждает запуск SDK, состав участников и доставку текста. Проверка RTP и качества аудио находится за пределами этих отчётов. [Публичный прогон](exe-release-public.json)

В первой hosted попытке Windows Server 2025 x64 (сборка 26100, WebView2 `157.0.4341.46`) подтвердился SHA-256 обоих поставочных EXE. После штатной очистки отдельно подтвердилось отсутствие `Pulse.exe` и `Data` для A и B. При повторной установке автоматизация запустила `Pulse.exe`, ожидала WebView2 и штатно закрыла окно. Требуемый target CDP не появился в 36-секундном окне. Позднее для проверки на disposable runner добавлен запуск в его обычном Win32 desktop, сохранивший изолированные IPC и WebView2-профили. [GitHub Actions](https://github.com/mrfrog2029-boop/pulse-windows-qa-2026-11-21/actions/runs/44897043304), [результаты post-clean](exe-hosted-44897043304.json)

Повтор на Windows Server 2025 с унаследованным desktop подтвердил дочерний `msedgewebview2.exe`. Локальный CDP endpoint по запрошенному порту по-прежнему отсутствовал. Такой же старт `Pulse.exe` для отдельной роли прошёл на Windows Server 2022 с WebView2 `131.0.2903.86`. Для проверки 2025 в тест добавлен разбор фактических параметров дочернего процесса Windows через `CommandLineToArgvW`, проверка каталога `EBWebView` и чтение соответствующих настроек Edge. Состояние этих настроек тест оставляет исходным. [Второй post-clean в Windows Server 2025](exe-hosted-44897674877.json), [контроль разных Windows VM](https://github.com/mrfrog2029-boop/pulse-windows-qa-2026-11-21/actions/runs/44897674862)

На Windows Server 2022 два действительно очищенных слота приняли точный релиз. Два процесса запустились с изолированными профилями и прошли проверки 1–7 и проверку активации ресурсов. Открытые сокеты также восстановились. При завершающем перезапуске сценарию помешал CDP тайм-аут нового процесса A, у которого на момент опроса отсутствовали новые прямые дочерние процессы WebView2. Теперь тест сохраняет параметры браузера и проверяет завершение предыдущего Pulse.exe и его WebView2 по PID и закрытию старого endpoint перед новым запуском. Локальный контроль той же сборки зарегистрировал завершение через `WM_CLOSE`, освобождение за 124 мс и дальнейший обмен сообщениями после смены PID. [Post-clean Windows Server 2022](exe-hosted-44898182655-windows-2022.json), [локальный перезапуск](exe-release-loopback-graceful.json), [правила повторного использования WebView2 Environment](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2environment.createasync)

В запуске 44898774051 диагностика отдельной чистой копии на Windows Server 2025 обнаружила `--remote-debugging-port` в окружении Win32 launcher. У дочернего WebView2 штатный `--user-data-dir` совпал с `Data/WebView/EBWebView`, где появились файлы `Default`. После разбора кавычек штатным Win32 API у дочернего процесса отсутствовали сам порт CDP и независимый флаг синтетического микрофона. Запрошенный endpoint оставался недоступным, а проверенные параметры политик `RemoteDebuggingAllowed`, `DeveloperToolsAvailability` и app-specific `AdditionalBrowserArguments` отсутствовали в доступных ключах `HKLM` и `HKCU`. Наблюдается отбрасывание дополнительных аргументов на этапе запуска WebView2 в этом образе. Его внутренний механизм требует отдельной диагностики runtime. В параллельной проверке Windows Server 2022 очиститель оставил условие `postCleanReady=false`, поэтому повторный старт на очищенных слотах не исполнялся. [GitHub Actions](https://github.com/mrfrog2029-boop/pulse-windows-qa-2026-11-21/actions/runs/44898774051), [диагностика Windows Server 2025](exe-hosted-44898774051-windows-2025.json)

Окончательная повторная проверка 44899278302 на Windows Server 2022 x64 (`20348`, WebView2 `131.0.2903.86`) завершилась с 12 PASS. Штатный `Pulse-Cleanup.exe` с SHA-256 `C16D41BD65B3D33C5B9630449C2815BEBD2C1C33932CD7753680F5556F27B9D2` устранил прежние EXE и каталоги данных в обоих слотах. В них запущен финальный Pulse с исходно указанным SHA-256 `B872…EC8B`. В проверке перезапуска прежний дочерний WebView2 PID 980 ещё существовал после завершения Pulse.exe PID 7656 командой `WM_CLOSE`. Через 213 мс после начала закрытия прежний процесс и его endpoint освободились. Тест повторно использовал те же параметры WebView2 и открыл прежний профиль через новый Pulse.exe PID 7032 и WebView2 PID 8128. Оба клиента снова показали двух участников и доставили текст в обе стороны. Отдельная проверка регистрации службы в общем GUI job получила BLOCKED при обработке `ServiceController`. [Успешный этап переустановки](https://github.com/mrfrog2029-boop/pulse-windows-qa-2026-11-21/actions/runs/44899278302/job/136831566503), [отчёт 12 PASS](exe-hosted-44899278302-windows-2022.json)

## Проверка выпуска от 21 ноября

Поставочный комплект повторил все 12 сценариев после очистки на Windows Server 2022 для итоговых SHA-256 `B872AB95…EC8B` и `FB6929E3…6F73`. Штатные GUI на обеих версиях Windows одновременно прошли все проверки служб и удаления настоящих профилей. [Итоговые измерения после очистки](exe-post-clean-2022.json), [запуск GitHub](https://github.com/mrfrog2029-boop/pulse-windows-qa-2026-11-21/actions/runs/44899839059)
