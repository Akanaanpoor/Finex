// Mini App front-end served at /app (HTML + CSS + vanilla JS in one string, no build step).
// String.raw keeps regex backslashes intact. Never use backticks or ${ inside this template.
export const MINI_APP_HTML = String.raw`
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Finance & Installments</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://cdn.tailwindcss.com/3.4.16"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js" defer></script>
  <style>
    * { font-family: 'Vazirmatn', 'Inter', sans-serif; -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    .en-font { font-family: 'Inter', sans-serif; }

    :root {
      --page-bg-solid: #070a13;
      --grad-1: rgba(99,102,241,0.20);
      --grad-2: rgba(16,185,129,0.14);
      --grad-3: rgba(245,158,11,0.08);
      --card-glass-bg: rgba(20, 26, 43, 0.72);
      --card-glass-border: rgba(255, 255, 255, 0.08);
      --surface-nav-c: rgba(17,24,39,0.7);
      --surface-1-c: #1f2937;
      --surface-1b-c: rgba(31,41,55,0.8);
      --surface-2-c: #111827;
      --surface-hover-c: rgba(55,65,81,0.5);
      --border-1-c: #1f2937;
      --border-2-c: #374151;
      --text-1-c: #f3f4f6;
      --text-2-c: #e5e7eb;
      --text-3-c: #d1d5db;
      --text-4-c: #9ca3af;
      --text-5-c: #6b7280;
      --text-6-c: #4b5563;
    }
    html.theme-light {
      --page-bg-solid: #f3f4f8;
      --grad-1: rgba(99,102,241,0.10);
      --grad-2: rgba(16,185,129,0.08);
      --grad-3: rgba(245,158,11,0.06);
      --card-glass-bg: rgba(255, 255, 255, 0.75);
      --card-glass-border: rgba(15, 17, 21, 0.08);
      --surface-nav-c: rgba(255,255,255,0.7);
      --surface-1-c: #eef0f5;
      --surface-1b-c: rgba(238,240,245,0.9);
      --surface-2-c: #ffffff;
      --surface-hover-c: rgba(0,0,0,0.05);
      --border-1-c: #e3e6ed;
      --border-2-c: #d7dbe3;
      --text-1-c: #12131a;
      --text-2-c: #1f2430;
      --text-3-c: #384152;
      --text-4-c: #5b6472;
      --text-5-c: #7c8598;
      --text-6-c: #9aa3b2;
    }

    html, body { background: var(--page-bg-solid); color: var(--text-1-c); min-height: 100vh; }
    body {
      background:
        radial-gradient(circle at 15% 0%, var(--grad-1), transparent 40%),
        radial-gradient(circle at 85% 10%, var(--grad-2), transparent 35%),
        radial-gradient(circle at 50% 100%, var(--grad-3), transparent 40%),
        var(--page-bg-solid);
      transition: background-color .25s ease, color .25s ease;
    }
    .card-glass {
      background: var(--card-glass-bg);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid var(--card-glass-border);
      transition: background-color .25s ease, border-color .25s ease;
    }
    .app-surface-nav { background: var(--surface-nav-c); }
    .app-surface-1 { background: var(--surface-1-c); }
    .app-surface-1b { background: var(--surface-1b-c); }
    .app-surface-2 { background: var(--surface-2-c); }
    .app-surface-hover:hover { background: var(--surface-hover-c); }
    .app-border-1 { border-color: var(--border-1-c); }
    .app-border-2 { border-color: var(--border-2-c); }
    .app-text-1 { color: var(--text-1-c); }
    .app-text-2 { color: var(--text-2-c); }
    .app-text-3 { color: var(--text-3-c); }
    .app-text-4 { color: var(--text-4-c); }
    .app-text-5 { color: var(--text-5-c); }
    .app-text-6 { color: var(--text-6-c); }
    input::placeholder, textarea::placeholder { color: var(--text-5-c); opacity: 1; }

    .tap { transition: transform .12s ease, opacity .12s ease; }
    .tap:active { transform: scale(0.95); opacity: 0.85; }
    .fade-in { animation: fadeIn .35s ease both; }
    @keyframes fadeIn { from { opacity:0; transform: translateY(6px);} to { opacity:1; transform: translateY(0);} }
    .skeleton { background: linear-gradient(90deg, rgba(120,120,140,0.08) 25%, rgba(120,120,140,0.18) 37%, rgba(120,120,140,0.08) 63%); background-size: 400% 100%; animation: shimmer 1.4s ease infinite; }
    @keyframes shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
    .bar-track { background: rgba(130,130,150,0.16); }
    .scroll-hide::-webkit-scrollbar { display: none; }

    .icon-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 14px; border: 1px solid var(--border-1-c); }

    .settings-pop {
      position: absolute; top: calc(100% + 8px); inset-inline-end: 0; z-index: 40;
      width: 220px; border-radius: 20px; padding: 14px;
      background: var(--surface-2-c); border: 1px solid var(--border-1-c);
      box-shadow: 0 20px 40px rgba(0,0,0,0.35);
    }
    html.theme-light .settings-pop { box-shadow: 0 20px 40px rgba(0,0,0,0.12); }

    .amount-sensitive { filter: blur(0px); transition: filter 0.15s ease; }
    html.amounts-hidden .amount-sensitive { filter: blur(8px); user-select: none; }

    .badge-chip { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 62px; opacity: 0.35; filter: grayscale(1); }
    .badge-chip.unlocked { opacity: 1; filter: none; }
    .budget-row + .budget-row { padding-top: 18px; }
  </style>
</head>
<body class="p-4 pb-28">
  <div class="max-w-md mx-auto space-y-4">

    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2.5">
        <div id="user-avatar" class="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold flex items-center justify-center text-sm shadow-lg shadow-indigo-900/40">U</div>
        <div>
          <div class="text-[10px] app-text-4 uppercase tracking-wider font-semibold" data-i18n="accountLabel">حساب کاربری</div>
          <div id="user-name" class="text-sm font-bold app-text-1">کاربر</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button id="top-add-btn" onclick="handleTopAddButton()" class="tap px-3.5 py-2 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-xs font-bold text-white shadow-lg shadow-indigo-900/40 flex items-center gap-1">
          <span>+</span> <span data-i18n="addBtn">افزودن</span>
        </button>
        <button onclick="refreshCurrentTab()" class="tap icon-btn app-surface-1b app-text-3">🔄</button>
        <div class="relative">
          <button id="settings-btn" onclick="toggleSettingsPopover()" class="tap icon-btn app-surface-1b app-text-3">⚙️</button>
          <div id="settings-popover" class="settings-pop hidden">
            <div class="text-[10px] font-bold app-text-4 uppercase tracking-wider mb-2" data-i18n="themeLabel">پوسته</div>
            <div class="grid grid-cols-2 app-surface-1 p-1 rounded-xl text-[11px] font-bold mb-3">
              <button type="button" id="theme-dark-btn" onclick="setTheme('dark')" class="tap py-1.5 rounded-lg app-text-3" data-i18n="themeDark">تیره</button>
              <button type="button" id="theme-light-btn" onclick="setTheme('light')" class="tap py-1.5 rounded-lg app-text-3" data-i18n="themeLight">روشن</button>
            </div>
            <div class="text-[10px] font-bold app-text-4 uppercase tracking-wider mb-2" data-i18n="langLabel">زبان</div>
            <div class="grid grid-cols-2 app-surface-1 p-1 rounded-xl text-[11px] font-bold">
              <button type="button" id="lang-fa-btn" onclick="setLang('fa')" class="tap py-1.5 rounded-lg app-text-3">فارسی</button>
              <button type="button" id="lang-en-btn" onclick="setLang('en')" class="tap py-1.5 rounded-lg app-text-3 en-font">English</button>
            </div>
            <div class="text-[10px] font-bold app-text-4 uppercase tracking-wider mb-2 mt-3" data-i18n="currencyLabel">واحد پول</div>
            <div class="grid grid-cols-2 app-surface-1 p-1 rounded-xl text-[11px] font-bold">
              <button type="button" id="cur-toman-btn" onclick="setCurrency('toman')" class="tap py-1.5 rounded-lg app-text-3" data-i18n="currencyToman">تومان</button>
              <button type="button" id="cur-usd-btn" onclick="setCurrency('usd')" class="tap py-1.5 rounded-lg app-text-3 en-font">USD ($)</button>
            </div>
            <div class="text-[10px] font-bold app-text-4 uppercase tracking-wider mb-2 mt-3" data-i18n="dataLabel">داده‌ها</div>
            <button type="button" onclick="exportData()" class="tap w-full py-2 rounded-xl app-surface-1 text-[11px] font-bold app-text-3 mb-2" data-i18n="exportBtn">📤 دریافت پشتیبان</button>
            <button type="button" onclick="openDeleteModal()" class="tap w-full py-2 rounded-xl bg-rose-500/15 text-rose-400 text-[11px] font-bold" data-i18n="deleteDataBtn">🗑 حذف داده‌ها</button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-4 app-surface-nav p-1 rounded-2xl border app-border-1 text-xs font-bold">
      <button onclick="switchMainTab('dashboard')" id="nav-dash" class="tap py-2.5 rounded-xl bg-indigo-600 text-white transition shadow-lg">📊 <span data-i18n="navDashboard">داشبورد</span></button>
      <button onclick="switchMainTab('installments')" id="nav-inst" class="tap py-2.5 rounded-xl app-text-4 transition">🗓 <span data-i18n="navInstallments">اقساط</span></button>
      <button onclick="switchMainTab('reports')" id="nav-reports" class="tap py-2.5 rounded-xl app-text-4 transition">📈 <span data-i18n="navReports">گزارشات</span></button>
      <button onclick="switchMainTab('about')" id="nav-about" class="tap py-2.5 rounded-xl app-text-4 transition">✨ <span data-i18n="navAbout">درباره</span></button>
    </div>

    <div id="tab-dashboard-view" class="space-y-4">

      <div class="month-stepper flex items-center justify-between app-surface-nav p-1 rounded-2xl border app-border-1">
        <button type="button" onclick="stepMonth(-1)" class="month-prev tap icon-btn app-text-3 text-lg">&lsaquo;</button>
        <button type="button" onclick="goToCurrentMonth()" class="month-label tap text-sm font-bold app-text-1 px-3 py-1.5">-</button>
        <button type="button" onclick="stepMonth(1)" class="month-next tap icon-btn app-text-3 text-lg">&rsaquo;</button>
      </div>

      <div class="card-glass p-5 rounded-3xl relative overflow-hidden shadow-2xl fade-in">
        <div class="absolute -top-10 -left-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>
        <div class="flex items-center justify-between">
          <span class="text-xs app-text-4 font-medium" data-i18n="netBalance">موجودی خالص</span>
          <button id="amount-visibility-btn" onclick="toggleAmountVisibility()" class="tap w-7 h-7 rounded-lg app-surface-1b app-text-4 flex items-center justify-center text-sm">👁️</button>
        </div>
        <div id="balance-total" class="amount-sensitive en-font text-3xl font-extrabold mt-1 tracking-tight text-emerald-400">$0.00</div>

        <div class="grid grid-cols-2 gap-3 mt-4 pt-4 border-t app-border-1">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold text-sm">↓</div>
            <div>
              <div class="text-[10px] app-text-4" data-i18n="totalIncome">مجموع درآمد</div>
              <div id="income-total" class="amount-sensitive en-font text-xs font-bold text-emerald-400 mt-0.5">$0.00</div>
            </div>
          </div>
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center font-bold text-sm">↑</div>
            <div>
              <div class="text-[10px] app-text-4" data-i18n="totalExpense">مجموع هزینه</div>
              <div id="expense-total" class="amount-sensitive en-font text-xs font-bold text-rose-400 mt-0.5">$0.00</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card-glass p-4 rounded-3xl fade-in">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold app-text-3" data-i18n="streakTitle">🔥 استریک ثبت روزانه</span>
          <span id="streak-count" class="en-font text-sm font-extrabold text-amber-400">0</span>
        </div>
        <div id="badges-strip" class="flex gap-3 overflow-x-auto scroll-hide pb-1"></div>
      </div>

      <div id="forecast-card" class="card-glass p-5 rounded-3xl relative overflow-hidden shadow-2xl border-r-4 border-r-violet-500 fade-in">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold app-text-3" data-i18n="forecastTitle">🔮 برآیند مالی این ماه</span>
          <span id="forecast-badge" class="text-[10px] px-2 py-1 rounded-full app-surface-1 app-text-4" data-i18n="calculating">در حال محاسبه...</span>
        </div>
        <p class="text-[11px] app-text-5 mt-1.5 leading-relaxed" data-i18n="forecastDesc">موجودی شما پس از پرداخت اقساط باقیمانده‌ی همین ماه، چقدر خواهد بود.</p>

        <div class="mt-3 space-y-2">
          <div>
            <div class="flex justify-between text-[10px] app-text-4 mb-1">
              <span data-i18n="currentBalance">موجودی فعلی</span>
              <span id="forecast-before" class="amount-sensitive en-font">$0.00</span>
            </div>
            <div class="h-2 rounded-full bar-track overflow-hidden">
              <div id="forecast-before-bar" class="h-full rounded-full bg-indigo-500" style="width:0%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-[10px] app-text-4 mb-1">
              <span data-i18n="balanceAfterInst">موجودی پس از اقساط</span>
              <span id="forecast-after" class="amount-sensitive en-font">$0.00</span>
            </div>
            <div class="h-2 rounded-full bar-track overflow-hidden">
              <div id="forecast-after-bar" class="h-full rounded-full bg-violet-500" style="width:0%"></div>
            </div>
          </div>
        </div>

        <div class="flex justify-between items-center mt-3 pt-3 border-t app-border-1 text-[11px]">
          <span class="app-text-4"><span data-i18n="remainingInst">اقساط باقیمانده</span> (<span id="forecast-count">0</span> <span data-i18n="items">مورد</span>)</span>
          <span id="forecast-pending-total" class="amount-sensitive font-bold text-amber-400">۰ تومان</span>
        </div>
      </div>

      <div class="card-glass p-5 rounded-3xl fade-in">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold app-text-3" data-i18n="budgetsTitle">🎯 بودجه‌بندی دسته‌ها</span>
          <button onclick="openBudgetModal()" class="tap text-[10px] px-2.5 py-1 rounded-full app-surface-1 app-text-3" data-i18n="editBtn">ویرایش</button>
        </div>
        <div id="budgets-container" class="space-y-0"></div>
      </div>

      <div class="card-glass p-4 rounded-3xl fade-in">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold app-text-3" data-i18n="flowTitle">جریان مالی</span>
          <span id="flow-month" class="text-[10px] app-text-5"></span>
        </div>
        <div class="flex items-center gap-4">
          <div class="w-24 h-24 relative flex-shrink-0">
            <canvas id="ratioChart"></canvas>
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div id="flow-center-value" class="amount-sensitive en-font text-base font-extrabold app-text-1">-</div>
              <div id="flow-center-label" class="text-[8px] app-text-5 leading-tight text-center px-2"></div>
            </div>
          </div>
          <div class="flex-1 space-y-2 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 app-text-4"><span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span><span data-i18n="incomeShort">درآمد</span></span>
              <span id="flow-income" class="amount-sensitive font-bold text-emerald-400">-</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1.5 app-text-4"><span class="w-2 h-2 rounded-full bg-rose-500 inline-block"></span><span data-i18n="expenseShort">هزینه</span></span>
              <span id="flow-expense" class="amount-sensitive font-bold text-rose-400">-</span>
            </div>
            <div class="flex items-center justify-between pt-2 border-t app-border-1">
              <span class="app-text-4" data-i18n="flowNet">مانده‌ی ماه</span>
              <span id="flow-net" class="amount-sensitive font-bold app-text-1">-</span>
            </div>
          </div>
        </div>
        <p id="flow-note" class="text-[10px] app-text-5 mt-3 leading-relaxed"></p>
      </div>

      <div class="flex app-surface-nav p-1 rounded-2xl border app-border-1 text-xs">
        <button onclick="setFilter('all')" id="tab-all" class="tap flex-1 py-1.5 rounded-xl bg-indigo-600 font-semibold text-white transition" data-i18n="filterAll">همه</button>
        <button onclick="setFilter('expense')" id="tab-expense" class="tap flex-1 py-1.5 rounded-xl app-text-4 transition" data-i18n="filterExpense">هزینه‌ها</button>
        <button onclick="setFilter('income')" id="tab-income" class="tap flex-1 py-1.5 rounded-xl app-text-4 transition" data-i18n="filterIncome">درآمدها</button>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center px-1">
          <span class="text-xs font-bold app-text-4 uppercase tracking-wider" data-i18n="transactionsTitle">تراکنش‌ها</span>
          <span id="items-count" class="text-[11px] app-text-5">۰ مورد</span>
        </div>
        <div id="items-container" class="space-y-2"></div>
      </div>
    </div>

    <div id="tab-installments-view" class="space-y-4 hidden">
      <div class="card-glass p-5 rounded-3xl relative overflow-hidden shadow-2xl border-r-4 border-r-amber-500 fade-in">
        <span class="text-xs app-text-4 font-medium" data-i18n="instTotalTitle">مجموع اقساط باقیمانده‌ی این ماه</span>
        <div id="inst-total" class="amount-sensitive text-2xl font-black mt-1 text-amber-400">۰ تومان</div>
        <p class="text-[11px] app-text-4 mt-2" data-i18n="instReminderNote">یادآوری خودکار یک روز قبل از سررسید در تلگرام ارسال می‌شود.</p>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between items-center px-1">
          <span class="text-xs font-bold app-text-4 uppercase tracking-wider" data-i18n="instListTitle">لیست اقساط</span>
          <span id="inst-count" class="text-[11px] app-text-5">۰ مورد</span>
        </div>
        <div id="inst-container" class="space-y-2"></div>
      </div>
    </div>

    <div id="tab-reports-view" class="space-y-4 hidden">
      <div class="month-stepper flex items-center justify-between app-surface-nav p-1 rounded-2xl border app-border-1">
        <button type="button" onclick="stepMonth(-1)" class="month-prev tap icon-btn app-text-3 text-lg">&lsaquo;</button>
        <button type="button" onclick="goToCurrentMonth()" class="month-label tap text-sm font-bold app-text-1 px-3 py-1.5">-</button>
        <button type="button" onclick="stepMonth(1)" class="month-next tap icon-btn app-text-3 text-lg">&rsaquo;</button>
      </div>

      <div class="card-glass p-5 rounded-3xl fade-in">
        <div class="text-xs font-bold app-text-4 uppercase tracking-wider mb-3" data-i18n="reportsTitle">روند درآمد و هزینه</div>
        <div id="reports-empty-state" class="hidden text-center text-xs app-text-4 py-8" data-i18n="reportsNoDataYet">هنوز داده‌ای برای این ماه ثبت نشده.</div>
        <div id="reports-chart-wrap" style="height: 220px;">
          <canvas id="reportsChart"></canvas>
        </div>
        <div class="flex flex-wrap gap-3 mt-3 text-[10px] app-text-4">
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#10b981"></span><span data-i18n="reportsChartLegendIncome">درآمد (این ماه)</span></span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#f43f5e"></span><span data-i18n="reportsChartLegendExpense">هزینه (این ماه)</span></span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block opacity-50" style="background:#10b981"></span><span data-i18n="reportsChartLegendIncomePrev">درآمد (ماه قبل)</span></span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block opacity-50" style="background:#f43f5e"></span><span data-i18n="reportsChartLegendExpensePrev">هزینه (ماه قبل)</span></span>
        </div>
      </div>

      <div class="card-glass p-5 rounded-3xl fade-in">
        <div id="reports-forecast-title" class="text-xs font-bold app-text-4 uppercase tracking-wider mb-3">پیش‌بینی ته ماه</div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <div class="text-[10px] app-text-4" data-i18n="reportsForecastIncome">درآمد</div>
            <div id="reports-forecast-income" class="amount-sensitive text-sm font-extrabold text-emerald-400 en-font mt-1">-</div>
          </div>
          <div>
            <div class="text-[10px] app-text-4" data-i18n="reportsForecastExpense">هزینه</div>
            <div id="reports-forecast-expense" class="amount-sensitive text-sm font-extrabold text-rose-400 en-font mt-1">-</div>
          </div>
          <div>
            <div class="text-[10px] app-text-4" data-i18n="reportsForecastBalance">تراز ماه</div>
            <div id="reports-forecast-balance" class="amount-sensitive text-sm font-extrabold app-text-1 en-font mt-1">-</div>
          </div>
        </div>
        <p id="reports-forecast-note" class="text-[10px] app-text-5 mt-3 leading-relaxed text-center"></p>
        <div id="reports-vs-last-month" class="text-center text-[10px] app-text-4 mt-2"></div>
      </div>

      <div class="card-glass p-5 rounded-3xl fade-in">
        <div class="text-xs font-bold app-text-4 uppercase tracking-wider mb-3" data-i18n="reportsCategoriesTitle">هزینه به تفکیک دسته</div>
        <div id="reports-categories" class="space-y-3"></div>
      </div>

      <div class="card-glass p-5 rounded-3xl fade-in">
        <div class="text-xs font-bold app-text-4 uppercase tracking-wider mb-3" data-i18n="reportsInsightsTitle">نکته‌های این ماه</div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <div class="text-[10px] app-text-4" data-i18n="insightAvgDaily">میانگین خرج روزانه</div>
            <div id="insight-avg-daily" class="amount-sensitive text-xs font-extrabold app-text-1 en-font mt-1">-</div>
          </div>
          <div>
            <div class="text-[10px] app-text-4" data-i18n="insightNoSpend">روز بدون خرج</div>
            <div id="insight-no-spend" class="text-xs font-extrabold app-text-1 en-font mt-1">-</div>
          </div>
          <div>
            <div class="text-[10px] app-text-4" data-i18n="insightBiggest">بزرگ‌ترین خرج</div>
            <div id="insight-biggest" class="amount-sensitive text-xs font-extrabold app-text-1 en-font mt-1">-</div>
          </div>
        </div>
        <div id="insight-biggest-desc" class="text-center text-[10px] app-text-5 mt-2"></div>
      </div>
    </div>

    <div id="tab-about-view" class="space-y-4 hidden">
      <div class="card-glass p-6 rounded-3xl text-center relative overflow-hidden fade-in">
        <div class="absolute -top-14 -right-14 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-14 -left-14 w-40 h-40 bg-violet-500/15 rounded-full blur-3xl"></div>
        <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shadow-lg shadow-indigo-900/40">💰</div>
        <div class="font-extrabold app-text-1 text-lg mt-3" data-i18n="aboutAppTitle">ردیاب مالی و اقساط</div>
        <div class="text-[11px] app-text-4 mt-1 leading-relaxed" data-i18n="aboutAppTagline">مدیریت هوشمند درآمد، هزینه و اقساط ماهانه — بر پایه‌ی تقویم شمسی</div>
        <div class="flex justify-center gap-2 mt-4 flex-wrap">
          <span class="text-[10px] px-2.5 py-1 rounded-full app-surface-1 app-text-3 en-font">Cloudflare Workers</span>
          <span class="text-[10px] px-2.5 py-1 rounded-full app-surface-1 app-text-3 en-font">Telegram Bot API</span>
          <span class="text-[10px] px-2.5 py-1 rounded-full app-surface-1 app-text-3 en-font">KV Storage</span>
        </div>
      </div>

      <div class="card-glass p-5 rounded-3xl space-y-3 fade-in">
        <div class="text-xs font-bold app-text-3 uppercase tracking-wider" data-i18n="aboutFeaturesTitle">امکانات</div>
        <div class="space-y-2.5 text-xs app-text-3">
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature1">ثبت سریع درآمد و هزینه از طریق چت تلگرام، مینی‌اپ یا iOS Shortcuts</span></div>
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature2">مدیریت اقساط با تقویم شمسی و دو حالت تکرار ماهانه / سالانه</span></div>
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature3">یادآوری خودکار یک روز قبل از سررسید هر قسط، مستقیم در تلگرام</span></div>
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature4">برآیند مالی: پیش‌بینی موجودی پس از پرداخت اقساط باقیمانده‌ی ماه</span></div>
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature5">دسته‌بندی هزینه‌ها، بودجه‌بندی و استریک ثبت روزانه</span></div>
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature6">پوسته‌ی روشن/تیره و رابط دوزبانه فارسی/انگلیسی</span></div>
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature7">گزارش لحظه‌ای مالی با فرستادن «گزارش» به بات</span></div>
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature8">گزارش ماهانه با نمودار، تفکیک دسته‌ها و مرور ماه‌های قبل</span></div>
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature9">پشتیبان‌گیری (JSON و CSV) و حذف کامل داده‌ها در هر زمان</span></div>
        </div>
      </div>

      <a href="https://t.me/ArefKp" target="_blank" rel="noopener" class="tap block card-glass p-5 rounded-3xl border-r-4 border-r-indigo-500 fade-in">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold flex-shrink-0">A</div>
          <div class="flex-1">
            <div class="text-[10px] app-text-4" data-i18n="aboutMadeBy">طراحی و توسعه توسط</div>
            <div class="text-sm font-bold app-text-1 en-font">Aref · @ArefKp</div>
          </div>
          <div class="text-indigo-400 text-lg">↗</div>
        </div>
      </a>

      <div class="text-center text-[10px] app-text-6 pb-2" data-i18n="aboutVersion">نسخه ۲.۱</div>
    </div>

  </div>

  <div id="entryModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-end sm:items-center justify-center p-4">
    <div class="card-glass app-surface-2 border app-border-2 w-full max-w-sm rounded-3xl p-5 space-y-3.5 shadow-2xl">
      <div id="modal-title" class="font-bold app-text-1 text-base" data-i18n="newTransaction">تراکنش جدید</div>
      <input type="hidden" id="entry-id">
      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="descriptionLabel">توضیحات</label>
        <input type="text" id="entry-desc" data-i18n-placeholder="descriptionPlaceholder" placeholder="مثال: قهوه، حقوق..." class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none focus:border-indigo-500">
      </div>
      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="amountLabel">مبلغ</label>
        <input type="number" id="entry-amount" placeholder="0.00" class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none focus:border-indigo-500 en-font">
      </div>
      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="typeLabel">نوع</label>
        <select id="entry-type" class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none">
          <option value="expense" data-i18n="typeExpenseOpt">🔴 هزینه</option>
          <option value="income" data-i18n="typeIncomeOpt">🟢 درآمد</option>
        </select>
      </div>
      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="categoryLabel">دسته‌بندی (اختیاری)</label>
        <select id="entry-category" class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none"></select>
      </div>
      <div class="grid grid-cols-2 gap-2 pt-2">
        <button onclick="closeModal('entryModal')" class="tap py-2.5 rounded-xl app-surface-1 text-xs font-semibold app-text-3" data-i18n="cancelBtn">انصراف</button>
        <button onclick="saveEntry()" class="tap py-2.5 rounded-xl bg-indigo-600 text-xs font-semibold text-white" data-i18n="saveBtn">ذخیره</button>
      </div>
    </div>
  </div>

  <div id="instModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-end sm:items-center justify-center p-4">
    <div class="card-glass app-surface-2 border app-border-2 w-full max-w-sm rounded-3xl p-5 space-y-3.5 shadow-2xl max-h-[90vh] overflow-y-auto scroll-hide">
      <div id="inst-modal-title" class="font-bold app-text-1 text-base" data-i18n="newInstallment">ثبت قسط جدید</div>
      <input type="hidden" id="inst-id">

      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="instTitleLabel">عنوان قسط (وام، بانک، دیجی‌پی...)</label>
        <input type="text" id="inst-title" data-i18n-placeholder="instTitlePlaceholder" placeholder="مثال: قسط بانک رسالت" class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none focus:border-amber-500">
      </div>
      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="instAmountLabel">مبلغ هر قسط (تومان)</label>
        <input type="number" id="inst-amount" placeholder="10000000" class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none focus:border-amber-500 en-font">
      </div>

      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="recurrenceLabel">نوع تکرار</label>
        <div class="grid grid-cols-2 app-surface-1 p-1 rounded-xl mt-1 text-xs font-bold">
          <button type="button" id="rec-monthly-btn" onclick="setRecurrence('monthly')" class="tap py-2 rounded-lg bg-amber-600 text-white" data-i18n="recurrenceMonthly">ماهانه</button>
          <button type="button" id="rec-yearly-btn" onclick="setRecurrence('yearly')" class="tap py-2 rounded-lg app-text-4" data-i18n="recurrenceYearly">سالانه</button>
        </div>
        <p class="text-[10px] app-text-5 mt-1" data-i18n="recurrenceHint">ماهانه: هر ماه در همین روز سررسید دارد. سالانه: فقط در ماه مشخص‌شده هر سال.</p>
      </div>

      <div id="inst-month-wrap" class="hidden">
        <label class="text-[11px] app-text-4 font-medium" data-i18n="instMonthLabel">ماه سررسید (شمسی)</label>
        <select id="inst-month" class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none"></select>
      </div>

      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="instDayLabel">روز سررسید در ماه شمسی (۱ تا ۳۱)</label>
        <input type="number" id="inst-day" min="1" max="31" placeholder="مثلاً: 25" class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none focus:border-amber-500 en-font">
      </div>
      <div>
        <label class="text-[11px] app-text-4 font-medium" data-i18n="instNotesLabel">توضیحات اختیاری</label>
        <input type="text" id="inst-notes" data-i18n-placeholder="instNotesPlaceholder" placeholder="شماره حساب یا توضیحات..." class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none focus:border-amber-500">
      </div>
      <div class="grid grid-cols-2 gap-2 pt-2">
        <button onclick="closeModal('instModal')" class="tap py-2.5 rounded-xl app-surface-1 text-xs font-semibold app-text-3" data-i18n="cancelBtn">انصراف</button>
        <button onclick="saveInstallment()" class="tap py-2.5 rounded-xl bg-amber-600 text-xs font-semibold text-white" data-i18n="saveInstBtn">ذخیره قسط</button>
      </div>
    </div>
  </div>

  <div id="budgetModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-end sm:items-center justify-center p-4">
    <div class="card-glass app-surface-2 border app-border-2 w-full max-w-sm rounded-3xl p-5 space-y-3.5 shadow-2xl max-h-[90vh] overflow-y-auto scroll-hide">
      <div class="font-bold app-text-1 text-base" data-i18n="budgetModalTitle">سقف بودجه‌ی ماهانه</div>
      <p class="text-[11px] app-text-5" data-i18n="budgetModalDesc">برای هر دسته یک سقف تعیین کن؛ صفر یعنی بدون سقف.</p>
      <div id="budget-form-container" class="space-y-2.5"></div>
      <div class="grid grid-cols-2 gap-2 pt-2">
        <button onclick="closeModal('budgetModal')" class="tap py-2.5 rounded-xl app-surface-1 text-xs font-semibold app-text-3" data-i18n="cancelBtn">انصراف</button>
        <button onclick="saveBudgets()" class="tap py-2.5 rounded-xl bg-violet-600 text-xs font-semibold text-white" data-i18n="saveBtn">ذخیره</button>
      </div>
    </div>
  </div>

  <div id="deleteModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-end sm:items-center justify-center p-4">
    <div class="card-glass app-surface-2 border app-border-2 w-full max-w-sm rounded-3xl p-5 space-y-3.5 shadow-2xl max-h-[90vh] overflow-y-auto scroll-hide">
      <div class="font-bold text-rose-400 text-base" data-i18n="deleteTitle">حذف داده‌ها</div>
      <p class="text-[11px] app-text-4 leading-relaxed" data-i18n="deleteWarn">داده‌های حذف‌شده قابل بازگشت نیستند.</p>
      <div class="space-y-2">
        <label class="flex items-center gap-2.5 app-surface-1 rounded-xl px-3 py-2.5 text-xs app-text-2 cursor-pointer"><input type="radio" name="delete-scope" value="transactions" onchange="onDeleteFormChange()"><span data-i18n="scopeTransactions">همه‌ی تراکنش‌ها</span></label>
        <label class="flex items-center gap-2.5 app-surface-1 rounded-xl px-3 py-2.5 text-xs app-text-2 cursor-pointer"><input type="radio" name="delete-scope" value="installments" onchange="onDeleteFormChange()"><span data-i18n="scopeInstallments">همه‌ی اقساط</span></label>
        <label class="flex items-center gap-2.5 app-surface-1 rounded-xl px-3 py-2.5 text-xs app-text-2 cursor-pointer"><input type="radio" name="delete-scope" value="budgets" onchange="onDeleteFormChange()"><span data-i18n="scopeBudgets">بودجه‌ها</span></label>
        <label class="flex items-center gap-2.5 bg-rose-500/10 rounded-xl px-3 py-2.5 text-xs text-rose-400 font-bold cursor-pointer"><input type="radio" name="delete-scope" value="all" onchange="onDeleteFormChange()"><span data-i18n="scopeAll">همه‌چیز (تراکنش، اقساط، بودجه، تنظیمات)</span></label>
      </div>
      <button type="button" onclick="exportData()" class="tap w-full py-2 rounded-xl app-surface-1 text-[11px] font-bold app-text-3" data-i18n="exportFirstBtn">📤 اول از داده‌هایم پشتیبان بگیر</button>
      <div>
        <label class="text-[11px] app-text-4 font-medium"><span data-i18n="deleteTypeToConfirm">برای تأیید این کلمه را تایپ کنید:</span> <b id="delete-word" class="text-rose-400"></b></label>
        <input type="text" id="delete-confirm-input" oninput="onDeleteFormChange()" autocomplete="off" class="w-full mt-1 app-surface-1 border app-border-2 rounded-xl px-3 py-2 text-sm app-text-1 focus:outline-none focus:border-rose-500">
      </div>
      <div class="grid grid-cols-2 gap-2 pt-1">
        <button onclick="closeModal('deleteModal')" class="tap py-2.5 rounded-xl app-surface-1 text-xs font-semibold app-text-3" data-i18n="cancelBtn">انصراف</button>
        <button id="delete-confirm-btn" onclick="confirmDeleteData()" disabled class="tap py-2.5 rounded-xl bg-rose-600 text-xs font-semibold text-white opacity-40" data-i18n="deleteConfirmBtn">حذف برای همیشه</button>
      </div>
    </div>
  </div>

  <div id="toast" class="fixed bottom-6 inset-x-0 z-[60] flex justify-center pointer-events-none opacity-0 transition-opacity duration-200">
    <div id="toast-text" class="app-surface-2 border app-border-2 app-text-1 text-xs font-semibold rounded-2xl px-4 py-2.5 shadow-2xl max-w-xs text-center"></div>
  </div>

  <script>
    const BASE_URL = '__BASE_URL__';

    // ---------- داده‌های ثابت: دسته‌بندی‌ها، ماه‌ها، نشان‌ها ----------
    const CATEGORIES = [
      { id: 'food', icon: '🍔', fa: 'خوراک', en: 'Food' },
      { id: 'transport', icon: '🚗', fa: 'حمل‌ونقل', en: 'Transport' },
      { id: 'bills', icon: '🧾', fa: 'قبوض', en: 'Bills' },
      { id: 'shopping', icon: '🛍️', fa: 'خرید', en: 'Shopping' },
      { id: 'health', icon: '💊', fa: 'سلامت', en: 'Health' },
      { id: 'entertainment', icon: '🎬', fa: 'سرگرمی', en: 'Entertainment' },
      { id: 'cafe', icon: '☕', fa: 'کافه', en: 'Cafe' },
      { id: 'ai', icon: '🤖', fa: 'هوش مصنوعی', en: 'AI' },
      { id: 'salary', icon: '💼', fa: 'حقوق', en: 'Salary' },
      { id: 'other', icon: '📌', fa: 'سایر', en: 'Other' }
    ];
    // فقط در گزارش‌ها دیده می‌شود (پرداخت اقساط خودکار دسته‌ی جدا می‌گیرد)
    const REPORT_ONLY_CATEGORIES = [
      { id: 'installments', icon: '🗓', fa: 'اقساط', en: 'Installments' }
    ];

    const MONTHS = {
      fa: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'],
      en: ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand']
    };

    const BADGE_DEFS = [
      { id: 'starter', icon: '🌱', test: function(s) { return s.totalTx >= 1; }, fa: 'قدم اول', en: 'First Step' },
      { id: 'streak3', icon: '🔥', test: function(s) { return s.streak >= 3; }, fa: '۳ روز متوالی', en: '3-Day Streak' },
      { id: 'streak7', icon: '🔥', test: function(s) { return s.streak >= 7; }, fa: 'یک هفته منظم', en: 'Week Streak' },
      { id: 'streak30', icon: '🏆', test: function(s) { return s.streak >= 30; }, fa: 'یک ماه بی‌وقفه', en: 'Month Streak' },
      { id: 'tx50', icon: '📈', test: function(s) { return s.totalTx >= 50; }, fa: '۵۰ تراکنش', en: '50 Logs' },
      { id: 'tx100', icon: '💯', test: function(s) { return s.totalTx >= 100; }, fa: 'صدتایی!', en: 'Century Club' },
      { id: 'firstPay', icon: '✅', test: function(s) { return s.paidInstallments >= 1; }, fa: 'اولین قسط پرداخت‌شده', en: 'First Installment Paid' }
    ];

    // ---------- دیکشنری دوزبانه ----------
    const I18N = {
      fa: {
        accountLabel: 'حساب کاربری', addBtn: 'افزودن', themeLabel: 'پوسته', themeDark: 'تیره', themeLight: 'روشن',
        langLabel: 'زبان', currencyLabel: 'واحد پول', currencyToman: 'تومان', dataLabel: 'داده‌ها',
        exportBtn: '📤 دریافت پشتیبان', deleteDataBtn: '🗑 حذف داده‌ها',
        navDashboard: 'داشبورد', navInstallments: 'اقساط', navReports: 'گزارشات', navAbout: 'درباره',
        reportsTitle: 'روند درآمد و هزینه', reportsNoDataYet: 'هنوز داده‌ای برای این ماه ثبت نشده.',
        reportsChartLegendIncome: 'درآمد (این ماه)', reportsChartLegendExpense: 'هزینه (این ماه)',
        reportsChartLegendIncomePrev: 'درآمد (ماه قبل)', reportsChartLegendExpensePrev: 'هزینه (ماه قبل)',
        reportsForecastTitle: 'پیش‌بینی ته ماه', reportsActualTitle: 'جمع‌بندی ماه',
        reportsForecastIncome: 'درآمد', reportsForecastExpense: 'هزینه', reportsForecastBalance: 'تراز ماه',
        reportsForecastNote: 'هزینه‌ی پیش‌بینی‌شده = هزینه تا امروز + میانگین خرج روزانه (%pace%) × روزهای باقی‌مانده + اقساط پرداخت‌نشده (%inst%). درآمد فقط مقدار ثبت‌شده است.',
        reportsVsExpense: 'هزینه نسبت به ماه قبل', reportsVsIncome: 'درآمد نسبت به ماه قبل',
        reportsCategoriesTitle: 'هزینه به تفکیک دسته', reportsNoCategories: 'هزینه‌ای برای این ماه ثبت نشده.',
        reportsInsightsTitle: 'نکته‌های این ماه', insightAvgDaily: 'میانگین خرج روزانه', insightNoSpend: 'روز بدون خرج', insightBiggest: 'بزرگ‌ترین خرج',
        netBalance: 'موجودی خالص', totalIncome: 'مجموع درآمد', totalExpense: 'مجموع هزینه',
        incomeShort: 'درآمد', expenseShort: 'هزینه',
        streakTitle: '🔥 استریک ثبت روزانه',
        forecastTitle: '🔮 برآیند مالی این ماه', calculating: 'در حال محاسبه...',
        forecastDesc: 'موجودی شما پس از پرداخت اقساط باقیمانده‌ی همین ماه، چقدر خواهد بود.',
        currentBalance: 'موجودی فعلی', balanceAfterInst: 'موجودی پس از اقساط',
        remainingInst: 'اقساط باقیمانده', items: 'مورد',
        positiveStatus: 'وضعیت مثبت', deficitStatus: 'هشدار کسری',
        budgetsTitle: '🎯 بودجه‌بندی دسته‌ها', editBtn: 'ویرایش', noBudgets: 'هنوز سقفی تعیین نکرده‌ای.',
        flowTitle: 'جریان مالی', flowNet: 'مانده‌ی ماه', flowSpentOfIncome: 'از درآمد خرج شده',
        flowNoData: 'داده‌ای نیست', flowNoIncome: 'بدون درآمد',
        flowNoteOk: 'این ماه %amount% از درآمدت باقی مانده.',
        flowNoteOver: 'هزینه‌ها %amount% از درآمد این ماه بیشتر شده است.',
        flowNoteNoIncome: 'برای این ماه درآمدی ثبت نشده؛ فقط هزینه‌ها نمایش داده می‌شوند.',
        flowNoteEmpty: 'برای این ماه تراکنشی ثبت نشده.',
        filterAll: 'همه', filterExpense: 'هزینه‌ها', filterIncome: 'درآمدها',
        transactionsTitle: 'تراکنش‌ها', noTransactions: 'هیچ تراکنشی ثبت نشده.',
        monthCurrentHint: 'بازگشت به ماه جاری',
        instTotalTitle: 'مجموع اقساط باقیمانده‌ی این ماه',
        instReminderNote: 'یادآوری خودکار یک روز قبل از سررسید در تلگرام ارسال می‌شود.',
        instListTitle: 'لیست اقساط', noInstallments: 'هیچ قسطی ثبت نشده است. روی + افزودن بزنید.',
        instNotDueThisMonth: 'این ماه سررسید ندارد', instPaidThisCycle: 'پرداخت‌شده این ماه', instPending: 'در انتظار پرداخت',
        instOverdue: '%n% روز گذشته از سررسید', instToday: 'امروز سررسید است', instTomorrow: 'فردا سررسید است', instInDays: '%n% روز تا سررسید',
        payBtn: 'پرداخت', recurrenceMonthlyBadge: 'ماهانه', recurrenceYearlyBadge: 'سالانه', dueDayWord: 'روز',
        everyMonthWord: 'هر ماه',
        aboutAppTitle: 'ردیاب مالی و اقساط', aboutAppTagline: 'مدیریت هوشمند درآمد، هزینه و اقساط ماهانه — بر پایه‌ی تقویم شمسی',
        aboutFeaturesTitle: 'امکانات',
        aboutFeature1: 'ثبت سریع درآمد و هزینه از طریق چت تلگرام، مینی‌اپ یا iOS Shortcuts',
        aboutFeature2: 'مدیریت اقساط با تقویم شمسی و دو حالت تکرار ماهانه / سالانه',
        aboutFeature3: 'یادآوری خودکار یک روز قبل از سررسید هر قسط، مستقیم در تلگرام',
        aboutFeature4: 'برآیند مالی: پیش‌بینی موجودی پس از پرداخت اقساط باقیمانده‌ی ماه',
        aboutFeature5: 'دسته‌بندی هزینه‌ها، بودجه‌بندی و استریک ثبت روزانه',
        aboutFeature6: 'پوسته‌ی روشن/تیره و رابط دوزبانه فارسی/انگلیسی',
        aboutFeature7: 'گزارش لحظه‌ای مالی با فرستادن «گزارش» به بات',
        aboutFeature8: 'گزارش ماهانه با نمودار، تفکیک دسته‌ها و مرور ماه‌های قبل',
        aboutFeature9: 'پشتیبان‌گیری (JSON و CSV) و حذف کامل داده‌ها در هر زمان',
        aboutMadeBy: 'طراحی و توسعه توسط', aboutVersion: 'نسخه ۲.۱',
        newTransaction: 'تراکنش جدید', editTransaction: 'ویرایش تراکنش',
        descriptionLabel: 'توضیحات', descriptionPlaceholder: 'مثال: قهوه، حقوق...',
        amountLabel: 'مبلغ', typeLabel: 'نوع', typeExpenseOpt: '🔴 هزینه', typeIncomeOpt: '🟢 درآمد',
        categoryLabel: 'دسته‌بندی (اختیاری)', categoryNone: 'بدون دسته',
        cancelBtn: 'انصراف', saveBtn: 'ذخیره',
        newInstallment: 'ثبت قسط جدید', editInstallment: 'ویرایش قسط',
        instTitleLabel: 'عنوان قسط (وام، بانک، دیجی‌پی...)', instTitlePlaceholder: 'مثال: قسط بانک رسالت',
        instAmountLabel: 'مبلغ هر قسط',
        recurrenceLabel: 'نوع تکرار', recurrenceMonthly: 'ماهانه', recurrenceYearly: 'سالانه',
        recurrenceHint: 'ماهانه: هر ماه در همین روز سررسید دارد. سالانه: فقط در ماه مشخص‌شده هر سال. روز ۳۱ در ماه‌های کوتاه‌تر به آخرین روز ماه می‌افتد.',
        instMonthLabel: 'ماه سررسید (شمسی)', instDayLabel: 'روز سررسید در ماه شمسی (۱ تا ۳۱)',
        instNotesLabel: 'توضیحات اختیاری', instNotesPlaceholder: 'شماره حساب یا توضیحات...',
        saveInstBtn: 'ذخیره قسط',
        budgetModalTitle: 'سقف بودجه‌ی ماهانه', budgetModalDesc: 'برای هر دسته یک سقف تعیین کن؛ صفر یعنی بدون سقف.',
        loadErrDash: 'خطا در بارگذاری اطلاعات.', loadErrInst: 'خطا در بارگذاری اقساط.',
        saveFailed: 'ذخیره انجام نشد', alertAmount: 'لطفاً مبلغ معتبر وارد کنید.', confirmDeleteTx: 'این تراکنش حذف شود؟',
        alertInstFields: 'لطفاً عنوان، مبلغ و روز سررسید را وارد کنید.',
        confirmPayInst: 'این قسط پرداخت‌شده ثبت و به لیست هزینه‌ها اضافه شود؟',
        confirmDeleteInst: 'این قسط حذف شود؟', alreadyPaid: 'این قسط در این ماه قبلاً پرداخت شده.',
        deleteTitle: 'حذف داده‌ها',
        deleteWarn: 'داده‌های حذف‌شده برای همیشه پاک می‌شوند و قابل بازگشت نیستند. پیشنهاد می‌کنیم قبل از حذف، پشتیبان بگیرید.',
        scopeTransactions: 'همه‌ی تراکنش‌ها', scopeInstallments: 'همه‌ی اقساط', scopeBudgets: 'سقف بودجه‌ها',
        scopeAll: 'همه‌چیز (تراکنش، اقساط، بودجه، تنظیمات)',
        exportFirstBtn: '📤 اول از داده‌هایم پشتیبان بگیر', deleteTypeToConfirm: 'برای تأیید این کلمه را تایپ کنید:',
        deleteWord: 'حذف', deleteConfirmBtn: 'حذف برای همیشه',
        deleteDone: 'داده‌ها حذف شدند.', deleteFailed: 'حذف انجام نشد',
        exportSending: 'در حال ارسال فایل‌ها...', exportSent: 'فایل‌های پشتیبان در چت ربات ارسال شد.', exportFailed: 'ارسال پشتیبان ناموفق بود.',
        needTelegram: 'این بخش فقط داخل تلگرام کار می‌کند.', settingsSaveFailed: 'ذخیره‌ی تنظیمات انجام نشد.'
      },
      en: {
        accountLabel: 'Account', addBtn: 'Add', themeLabel: 'Theme', themeDark: 'Dark', themeLight: 'Light',
        langLabel: 'Language', currencyLabel: 'Currency', currencyToman: 'Toman', dataLabel: 'Data',
        exportBtn: '📤 Export backup', deleteDataBtn: '🗑 Delete my data',
        navDashboard: 'Dashboard', navInstallments: 'Installments', navReports: 'Reports', navAbout: 'About',
        reportsTitle: 'Income & Expense Trend', reportsNoDataYet: 'No data recorded yet for this month.',
        reportsChartLegendIncome: 'Income (this month)', reportsChartLegendExpense: 'Expense (this month)',
        reportsChartLegendIncomePrev: 'Income (last month)', reportsChartLegendExpensePrev: 'Expense (last month)',
        reportsForecastTitle: 'End-of-month forecast', reportsActualTitle: 'Month summary',
        reportsForecastIncome: 'Income', reportsForecastExpense: 'Expense', reportsForecastBalance: 'Month net',
        reportsForecastNote: 'Projected expense = spent so far + average daily spend (%pace%) × remaining days + unpaid installments (%inst%). Income is only what has been recorded.',
        reportsVsExpense: 'Expense vs. last month', reportsVsIncome: 'Income vs. last month',
        reportsCategoriesTitle: 'Spending by category', reportsNoCategories: 'No expenses recorded this month.',
        reportsInsightsTitle: 'This month at a glance', insightAvgDaily: 'Avg. daily spend', insightNoSpend: 'No-spend days', insightBiggest: 'Biggest expense',
        netBalance: 'Net Balance', totalIncome: 'Total Income', totalExpense: 'Total Expense',
        incomeShort: 'Income', expenseShort: 'Expense',
        streakTitle: '🔥 Daily Logging Streak',
        forecastTitle: '🔮 This Month Forecast', calculating: 'Calculating...',
        forecastDesc: 'Your balance after paying the remaining installments for this month.',
        currentBalance: 'Current Balance', balanceAfterInst: 'Balance After Installments',
        remainingInst: 'Remaining Installments', items: 'items',
        positiveStatus: 'Positive', deficitStatus: 'Deficit Warning',
        budgetsTitle: '🎯 Category Budgets', editBtn: 'Edit', noBudgets: 'No budget limits set yet.',
        flowTitle: 'Financial Flow', flowNet: 'Month balance', flowSpentOfIncome: 'of income spent',
        flowNoData: 'No data', flowNoIncome: 'No income',
        flowNoteOk: 'You have %amount% of this month\'s income left.',
        flowNoteOver: 'Spending is %amount% above this month\'s income.',
        flowNoteNoIncome: 'No income recorded for this month; only expenses are shown.',
        flowNoteEmpty: 'No transactions recorded for this month.',
        filterAll: 'All', filterExpense: 'Expenses', filterIncome: 'Income',
        transactionsTitle: 'Transactions', noTransactions: 'No transactions recorded.',
        monthCurrentHint: 'Back to current month',
        instTotalTitle: 'Total Remaining Installments This Month',
        instReminderNote: 'An automatic reminder is sent on Telegram one day before each due date.',
        instListTitle: 'Installments', noInstallments: 'No installments yet. Tap + Add.',
        instNotDueThisMonth: 'Not due this month', instPaidThisCycle: 'Paid this month', instPending: 'Pending',
        instOverdue: '%n% day(s) overdue', instToday: 'Due today', instTomorrow: 'Due tomorrow', instInDays: 'Due in %n% days',
        payBtn: 'Pay', recurrenceMonthlyBadge: 'Monthly', recurrenceYearlyBadge: 'Yearly', dueDayWord: 'day',
        everyMonthWord: 'every month',
        aboutAppTitle: 'Finance & Installments Tracker', aboutAppTagline: 'Smart income, expense and monthly installment management — built on the Persian calendar',
        aboutFeaturesTitle: 'Features',
        aboutFeature1: 'Log income/expenses instantly via Telegram chat, the mini app, or iOS Shortcuts',
        aboutFeature2: 'Manage installments on the Persian calendar with monthly or yearly recurrence',
        aboutFeature3: 'Automatic reminder one day before each installment is due, right in Telegram',
        aboutFeature4: 'Financial forecast: predicted balance after the remaining installments for this month',
        aboutFeature5: 'Expense categories, budget limits, and a daily logging streak',
        aboutFeature6: 'Light/dark theme and a bilingual Persian/English interface',
        aboutFeature7: 'Instant financial report by sending "report" to the bot',
        aboutFeature8: 'Monthly reports with charts, category breakdown and past-month browsing',
        aboutFeature9: 'Backups (JSON & CSV) and full data deletion at any time',
        aboutMadeBy: 'Designed & developed by', aboutVersion: 'Version 2.1',
        newTransaction: 'New Transaction', editTransaction: 'Edit Transaction',
        descriptionLabel: 'Description', descriptionPlaceholder: 'e.g. Coffee, Salary...',
        amountLabel: 'Amount', typeLabel: 'Type', typeExpenseOpt: '🔴 Expense', typeIncomeOpt: '🟢 Income',
        categoryLabel: 'Category (optional)', categoryNone: 'No category',
        cancelBtn: 'Cancel', saveBtn: 'Save',
        newInstallment: 'New Installment', editInstallment: 'Edit Installment',
        instTitleLabel: 'Installment title (loan, bank...)', instTitlePlaceholder: 'e.g. Bank Loan',
        instAmountLabel: 'Amount per installment',
        recurrenceLabel: 'Recurrence', recurrenceMonthly: 'Monthly', recurrenceYearly: 'Yearly',
        recurrenceHint: 'Monthly: due on this day every month. Yearly: only in the selected month, every year. Day 31 falls on the last day of shorter months.',
        instMonthLabel: 'Due month (Persian calendar)', instDayLabel: 'Due day of Persian month (1-31)',
        instNotesLabel: 'Notes (optional)', instNotesPlaceholder: 'Account number or notes...',
        saveInstBtn: 'Save Installment',
        budgetModalTitle: 'Monthly Budget Limits', budgetModalDesc: 'Set a limit per category; 0 means no limit.',
        loadErrDash: 'Error loading data.', loadErrInst: 'Error loading installments.',
        saveFailed: 'Could not save', alertAmount: 'Please enter a valid amount.', confirmDeleteTx: 'Delete this transaction?',
        alertInstFields: 'Please enter title, amount and due day.',
        confirmPayInst: 'Mark this installment as paid and add it to expenses?',
        confirmDeleteInst: 'Delete this installment?', alreadyPaid: 'This installment is already paid for this month.',
        deleteTitle: 'Delete my data',
        deleteWarn: 'Deleted data is removed permanently and cannot be restored. We suggest exporting a backup first.',
        scopeTransactions: 'All transactions', scopeInstallments: 'All installments', scopeBudgets: 'Budget limits',
        scopeAll: 'Everything (transactions, installments, budgets, settings)',
        exportFirstBtn: '📤 Export a backup first', deleteTypeToConfirm: 'Type this word to confirm:',
        deleteWord: 'DELETE', deleteConfirmBtn: 'Delete forever',
        deleteDone: 'Your data was deleted.', deleteFailed: 'Could not delete',
        exportSending: 'Sending files...', exportSent: 'Backup files were sent to the bot chat.', exportFailed: 'Could not send the backup.',
        needTelegram: 'This only works inside Telegram.', settingsSaveFailed: 'Could not save settings.'
      }
    };

    function t(key) {
      return (I18N[currentLang] && I18N[currentLang][key]) || I18N.fa[key] || key;
    }
    function tf(key, vars) {
      let s = t(key);
      Object.keys(vars || {}).forEach(function(k) { s = s.split('%' + k + '%').join(vars[k]); });
      return s;
    }

    // ---------- وضعیت برنامه ----------
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { tg.expand(); tg.ready(); }

    // initData امضاشده‌ی تلگرام؛ سرور با آن هویت کاربر را تأیید می‌کند. بدون آن (باز شدن خارج از تلگرام)
    // فقط حالت قدیمی با uid در آدرس کار می‌کند و عملیات حساس (پشتیبان/حذف) غیرفعال است.
    const initData = (tg && tg.initData) || '';
    const tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    const urlParams = new URLSearchParams(window.location.search);
    const currentUserId = tgUser && tgUser.id ? String(tgUser.id) : (urlParams.get('uid') || 'guest_user');
    const currentUserName = (tgUser && tgUser.first_name) || 'کاربر مالی';
    document.getElementById('user-name').textContent = currentUserName;
    document.getElementById('user-avatar').textContent = currentUserName.charAt(0).toUpperCase();

    function readStore(key, fallback) {
      try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
    }
    function writeStore(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    let currentTheme = readStore('ft_theme', 'dark');
    let currentLang = readStore('ft_lang', 'fa');
    let currency = readStore('ft_currency', 'toman') === 'usd' ? 'usd' : 'toman';
    let amountsHidden = readStore('ft_amounts_hidden', '0') === '1';

    let activeMainTab = 'dashboard';
    let dashboard = null;        // آخرین پاسخ /api/dashboard
    let records = [];
    let monthStats = { income: 0, expense: 0, net: 0, count: 0 };
    let installments = [];
    let summary = null;
    let budgetLimits = {};
    let availableMonths = [];
    let currentMonthKey = null;
    let selectedMonth = null;    // null = ماه جاری
    let activeFilter = 'all';
    let flowChart = null;
    let reportsChartInstance = null;
    let lastReportsData = null;
    let currentRecurrence = 'monthly';

    // ---------- شبکه ----------
    async function api(path, options) {
      const opts = options || {};
      const headers = {};
      if (initData) headers['X-Telegram-Init-Data'] = initData;
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(BASE_URL + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok) {
        const err = new Error((data && data.error) || ('HTTP ' + res.status));
        err.status = res.status;
        throw err;
      }
      return data;
    }

    function userQuery() { return 'userId=' + encodeURIComponent(currentUserId); }
    function monthQuery() { return selectedMonth ? '&month=' + encodeURIComponent(selectedMonth) : ''; }

    // Chart.js با defer بارگذاری می‌شود؛ اگر هنوز نیامده بود، بعد از load اجرا می‌کنیم
    function withChart(fn) {
      if (window.Chart) fn();
      else window.addEventListener('load', function() { if (window.Chart) fn(); });
    }

    let toastTimer = null;
    function showToast(message) {
      const box = document.getElementById('toast');
      document.getElementById('toast-text').textContent = message;
      box.classList.remove('opacity-0');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function() { box.classList.add('opacity-0'); }, 3200);
    }

    // ---------- قالب‌بندی ----------
    function locale() { return currentLang === 'fa' ? 'fa-IR' : 'en-US'; }
    function fmtNum(n) { return (Number(n) || 0).toLocaleString(locale()); }
    // علامت‌های یونیکد برای جلوگیری از جابه‌جا شدن + و - و % در متن راست‌به‌چپ
    const LRI = '\u2066';
    const PDI = '\u2069';
    function compactFmt() { return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }); }

    // یک واحد پول واحد برای همه‌ی مبالغ (تراکنش‌ها، اقساط، پیش‌بینی)
    function fmtMoney(n) {
      const v = Number(n) || 0;
      if (currency === 'usd') return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
      return v.toLocaleString(locale()) + ' ' + (currentLang === 'fa' ? 'تومان' : 'Toman');
    }

    function monthTitle(monthKey) {
      const parts = String(monthKey || '').split('-');
      const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
      if (!y || !m) return String(monthKey || '');
      return MONTHS[currentLang][m - 1] + ' ' + y.toLocaleString(locale(), { useGrouping: false });
    }

    // ---------- تم ----------
    function applyTheme() {
      document.documentElement.classList.toggle('theme-light', currentTheme === 'light');
      const darkBtn = document.getElementById('theme-dark-btn');
      const lightBtn = document.getElementById('theme-light-btn');
      if (currentTheme === 'dark') {
        darkBtn.className = 'tap py-1.5 rounded-lg bg-indigo-600 text-white';
        lightBtn.className = 'tap py-1.5 rounded-lg app-text-3';
      } else {
        lightBtn.className = 'tap py-1.5 rounded-lg bg-indigo-600 text-white';
        darkBtn.className = 'tap py-1.5 rounded-lg app-text-3';
      }
    }

    function setTheme(theme) {
      currentTheme = theme;
      writeStore('ft_theme', theme);
      applyTheme();
    }

    // ---------- نمایش/مخفی‌سازی مبالغ ----------
    function applyAmountVisibility() {
      document.documentElement.classList.toggle('amounts-hidden', amountsHidden);
      const btn = document.getElementById('amount-visibility-btn');
      if (btn) btn.textContent = amountsHidden ? '🙈' : '👁️';
    }

    function toggleAmountVisibility() {
      amountsHidden = !amountsHidden;
      writeStore('ft_amounts_hidden', amountsHidden ? '1' : '0');
      applyAmountVisibility();
    }

    // ---------- زبان و واحد پول ----------
    function applyStaticTranslations() {
      document.querySelectorAll('[data-i18n]').forEach(function(el) {
        el.textContent = t(el.getAttribute('data-i18n'));
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
      });
    }

    function applyCurrencyButtons() {
      const tomanBtn = document.getElementById('cur-toman-btn');
      const usdBtn = document.getElementById('cur-usd-btn');
      tomanBtn.className = 'tap py-1.5 rounded-lg ' + (currency === 'toman' ? 'bg-indigo-600 text-white' : 'app-text-3');
      usdBtn.className = 'tap py-1.5 rounded-lg en-font ' + (currency === 'usd' ? 'bg-indigo-600 text-white' : 'app-text-3');
    }

    function renderAll() {
      if (dashboard) renderDashboard();
      if (installments.length || dashboard) renderInstallments();
      if (lastReportsData) renderReports(lastReportsData);
      updateMonthStepper();
    }

    function applyLanguage() {
      document.documentElement.setAttribute('dir', currentLang === 'fa' ? 'rtl' : 'ltr');
      document.documentElement.setAttribute('lang', currentLang === 'fa' ? 'fa' : 'en');
      const faBtn = document.getElementById('lang-fa-btn');
      const enBtn = document.getElementById('lang-en-btn');
      if (currentLang === 'fa') {
        faBtn.className = 'tap py-1.5 rounded-lg bg-indigo-600 text-white';
        enBtn.className = 'tap py-1.5 rounded-lg app-text-3 en-font';
      } else {
        enBtn.className = 'tap py-1.5 rounded-lg bg-indigo-600 text-white en-font';
        faBtn.className = 'tap py-1.5 rounded-lg app-text-3';
      }
      applyStaticTranslations();
      applyCurrencyButtons();
      populateMonthSelect();
      populateCategorySelect();
      renderAll();
    }

    function setLang(lang) {
      currentLang = lang;
      writeStore('ft_lang', lang);
      applyLanguage();
    }

    async function setCurrency(next) {
      if (next === currency) return;
      currency = next;
      writeStore('ft_currency', next);
      applyCurrencyButtons();
      renderAll();
      try {
        await api('/api/settings', { method: 'POST', body: { userId: currentUserId, settings: { currency: next } } });
      } catch (e) {
        showToast(t('settingsSaveFailed'));
      }
    }

    function toggleSettingsPopover() {
      document.getElementById('settings-popover').classList.toggle('hidden');
    }
    document.addEventListener('click', function(e) {
      const pop = document.getElementById('settings-popover');
      const btn = document.getElementById('settings-btn');
      if (!pop.classList.contains('hidden') && !pop.contains(e.target) && e.target !== btn) {
        pop.classList.add('hidden');
      }
    });

    // ---------- ماه‌ها و دسته‌بندی‌ها ----------
    function populateMonthSelect() {
      const monthSelect = document.getElementById('inst-month');
      const prevValue = monthSelect.value;
      monthSelect.innerHTML = '';
      MONTHS[currentLang].forEach(function(name, idx) {
        const opt = document.createElement('option');
        opt.value = String(idx + 1);
        opt.textContent = name;
        monthSelect.appendChild(opt);
      });
      if (prevValue) monthSelect.value = prevValue;
    }

    function populateCategorySelect() {
      const sel = document.getElementById('entry-category');
      const prevValue = sel.value;
      sel.innerHTML = '';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = t('categoryNone');
      sel.appendChild(noneOpt);
      CATEGORIES.forEach(function(cat) {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.icon + ' ' + cat[currentLang];
        sel.appendChild(opt);
      });
      if (prevValue) sel.value = prevValue;
    }

    function getCategory(id) {
      return CATEGORIES.find(function(c) { return c.id === id; }) || null;
    }
    function getReportCategory(id) {
      return getCategory(id) || REPORT_ONLY_CATEGORIES.find(function(c) { return c.id === id; }) || null;
    }

    // دسته‌بندی به‌صورت یک هشتگ در انتهای توضیحات ذخیره می‌شود، بدون نیاز به تغییر اسکیمای سرور
    function parseCategoryFromDescription(desc) {
      const m = String(desc || '').match(/#([a-z]+)\s*$/i);
      if (m && getCategory(m[1].toLowerCase())) {
        return { clean: desc.slice(0, m.index).trim(), categoryId: m[1].toLowerCase() };
      }
      return { clean: desc, categoryId: '' };
    }

    function buildDescriptionWithCategory(clean, categoryId) {
      const base = (clean || '').trim();
      if (!categoryId) return base;
      return base + ' #' + categoryId;
    }

    // ---------- تب‌ها ----------
    const TAB_NAV_IDS = { dashboard: 'nav-dash', installments: 'nav-inst', reports: 'nav-reports', about: 'nav-about' };
    const TAB_VIEW_IDS = { dashboard: 'tab-dashboard-view', installments: 'tab-installments-view', reports: 'tab-reports-view', about: 'tab-about-view' };

    function dashboardMonthIsStale() {
      return !dashboard || dashboard.month !== (selectedMonth || currentMonthKey || dashboard.month);
    }

    function switchMainTab(tab) {
      activeMainTab = tab;
      Object.keys(TAB_NAV_IDS).forEach(function(key) {
        const btn = document.getElementById(TAB_NAV_IDS[key]);
        const view = document.getElementById(TAB_VIEW_IDS[key]);
        if (key === tab) {
          btn.className = 'tap py-2.5 rounded-xl bg-indigo-600 text-white transition shadow-lg';
          view.classList.remove('hidden');
        } else {
          btn.className = 'tap py-2.5 rounded-xl app-text-4 transition';
          view.classList.add('hidden');
        }
      });
      const addBtn = document.getElementById('top-add-btn');
      addBtn.style.visibility = (tab === 'about' || tab === 'reports') ? 'hidden' : 'visible';
      if (tab === 'installments') loadInstallmentsData();
      if (tab === 'reports') loadReportsData();
      if (tab === 'dashboard' && dashboardMonthIsStale()) loadDashboardData();
    }

    function handleTopAddButton() {
      if (activeMainTab === 'installments') openNewInstModal();
      else if (activeMainTab === 'dashboard') openNewModal();
    }

    function refreshCurrentTab() {
      if (activeMainTab === 'dashboard') loadDashboardData();
      else if (activeMainTab === 'reports') loadReportsData();
      else if (activeMainTab === 'installments') loadInstallmentsData();
    }

    // ---------- انتخاب ماه ----------
    function updateMonthStepper(shownMonth) {
      const month = shownMonth || (dashboard && dashboard.month) || selectedMonth || currentMonthKey;
      const idx = availableMonths.indexOf(month);
      const isRtl = currentLang === 'fa';
      document.querySelectorAll('.month-label').forEach(function(el) {
        el.textContent = month ? monthTitle(month) : '-';
        el.setAttribute('title', t('monthCurrentHint'));
        el.classList.toggle('text-indigo-400', !!month && month !== currentMonthKey);
      });
      document.querySelectorAll('.month-prev').forEach(function(el) {
        el.innerHTML = isRtl ? '&rsaquo;' : '&lsaquo;';
        el.style.opacity = idx > 0 ? '1' : '0.25';
      });
      document.querySelectorAll('.month-next').forEach(function(el) {
        el.innerHTML = isRtl ? '&lsaquo;' : '&rsaquo;';
        el.style.opacity = idx !== -1 && idx < availableMonths.length - 1 ? '1' : '0.25';
      });
    }

    function stepMonth(delta) {
      const shown = (activeMainTab === 'reports' && lastReportsData && lastReportsData.month) || (dashboard && dashboard.month) || currentMonthKey;
      const idx = availableMonths.indexOf(shown);
      const target = availableMonths[idx + delta];
      if (idx === -1 || !target) return;
      selectedMonth = target === currentMonthKey ? null : target;
      refreshCurrentTab();
    }

    function goToCurrentMonth() {
      if (!selectedMonth) return;
      selectedMonth = null;
      refreshCurrentTab();
    }

    function showSkeleton(containerId, count) {
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'skeleton h-14 rounded-2xl';
        container.appendChild(row);
      }
    }

    function showLoadError(containerId, key) {
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'text-center text-rose-400 py-6 text-xs';
      errDiv.textContent = t(key);
      container.appendChild(errDiv);
    }

    // ---------- داشبورد ----------
    async function loadDashboardData() {
      showSkeleton('items-container', 3);
      try {
        const d = await api('/api/dashboard?' + userQuery() + monthQuery());
        dashboard = d;
        records = Array.isArray(d.records) ? d.records : [];
        monthStats = d.monthStats || monthStats;
        summary = d.summary || null;
        installments = Array.isArray(d.installments) ? d.installments : [];
        budgetLimits = (d.budgets && d.budgets.limits) || {};
        availableMonths = d.months || [];
        currentMonthKey = d.currentMonth || availableMonths[availableMonths.length - 1] || null;
        if (d.settings && (d.settings.currency === 'usd' || d.settings.currency === 'toman')) {
          currency = d.settings.currency;
          writeStore('ft_currency', currency);
          applyCurrencyButtons();
        }
        renderDashboard();
        updateMonthStepper(d.month);
        if (activeMainTab === 'installments') renderInstallments();
      } catch (err) {
        showLoadError('items-container', 'loadErrDash');
      }
    }

    async function loadInstallmentsData() {
      showSkeleton('inst-container', 3);
      try {
        const data = await api('/api/installments?' + userQuery());
        installments = Array.isArray(data) ? data : [];
        renderInstallments();
      } catch (err) {
        showLoadError('inst-container', 'loadErrInst');
      }
    }

    function renderDashboard() {
      const income = (summary && summary.income) || 0;
      const expense = (summary && summary.expense) || 0;
      const balance = (summary && summary.balance) || 0;

      document.getElementById('income-total').textContent = fmtMoney(income);
      document.getElementById('expense-total').textContent = fmtMoney(expense);

      const balEl = document.getElementById('balance-total');
      balEl.textContent = fmtMoney(balance);
      balEl.className = 'amount-sensitive en-font text-3xl font-extrabold mt-1 tracking-tight ' + (balance >= 0 ? 'text-emerald-400' : 'text-rose-400');

      renderForecast();
      renderBudgets();
      renderStreakBadges();
      renderFlow();
      renderTransactionsList();
    }

    function renderForecast() {
      if (!summary) return;
      const before = summary.balance || 0;
      const after = summary.projectedBalance || 0;
      const pendingTotal = summary.pendingTotal || 0;
      const count = (summary.pendingList && summary.pendingList.length) || 0;

      document.getElementById('forecast-before').textContent = fmtMoney(before);
      document.getElementById('forecast-after').textContent = fmtMoney(after);
      document.getElementById('forecast-count').textContent = fmtNum(count);
      document.getElementById('forecast-pending-total').textContent = fmtMoney(pendingTotal);

      const badge = document.getElementById('forecast-badge');
      if (after >= 0) {
        badge.className = 'text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400';
        badge.textContent = t('positiveStatus');
      } else {
        badge.className = 'text-[10px] px-2 py-1 rounded-full bg-rose-500/15 text-rose-400';
        badge.textContent = t('deficitStatus');
      }

      const maxAbs = Math.max(Math.abs(before), Math.abs(after), 1);
      const beforePct = Math.min(100, Math.round((Math.abs(before) / maxAbs) * 100));
      const afterPct = Math.min(100, Math.round((Math.abs(after) / maxAbs) * 100));
      document.getElementById('forecast-before-bar').style.width = beforePct + '%';
      const afterBar = document.getElementById('forecast-after-bar');
      afterBar.style.width = afterPct + '%';
      afterBar.className = 'h-full rounded-full ' + (after >= 0 ? 'bg-violet-500' : 'bg-rose-500');
    }

    // هر مبلغ فقط در ماهِ نمایش‌داده‌شده حساب می‌شود (records همان ماه است)
    function computeCategorySpending() {
      const spend = {};
      records.forEach(function(r) {
        if (r.type !== 'expense') return;
        const parsed = parseCategoryFromDescription(r.description);
        if (!parsed.categoryId) return;
        spend[parsed.categoryId] = (spend[parsed.categoryId] || 0) + (Number(r.amount) || 0);
      });
      return spend;
    }

    function renderBudgets() {
      const container = document.getElementById('budgets-container');
      container.innerHTML = '';
      const spend = computeCategorySpending();
      const activeCats = CATEGORIES.filter(function(c) { return (budgetLimits[c.id] || 0) > 0 || spend[c.id] > 0; });

      if (activeCats.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center app-text-5 text-[11px] py-3';
        empty.textContent = t('noBudgets');
        container.appendChild(empty);
        return;
      }

      activeCats.forEach(function(cat) {
        const spent = spend[cat.id] || 0;
        const limit = budgetLimits[cat.id] || 0;
        const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
        const overLimit = limit > 0 && spent > limit;

        const row = document.createElement('div');
        row.className = 'budget-row';

        const top = document.createElement('div');
        top.className = 'flex justify-between items-center text-[11px] mb-1';
        const label = document.createElement('span');
        label.className = 'app-text-3';
        label.textContent = cat.icon + ' ' + cat[currentLang];
        const amountSpan = document.createElement('span');
        amountSpan.className = 'amount-sensitive ' + (overLimit ? 'text-rose-400' : 'app-text-4');
        amountSpan.textContent = limit > 0 ? (fmtMoney(spent) + ' / ' + fmtMoney(limit)) : fmtMoney(spent);
        top.appendChild(label);
        top.appendChild(amountSpan);

        row.appendChild(top);

        if (limit > 0) {
          const track = document.createElement('div');
          track.className = 'h-1.5 rounded-full bar-track overflow-hidden';
          const bar = document.createElement('div');
          bar.className = 'h-full rounded-full ' + (overLimit ? 'bg-rose-500' : (pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'));
          bar.style.width = pct + '%';
          track.appendChild(bar);
          row.appendChild(track);
        }

        container.appendChild(row);
      });
    }

    function openBudgetModal() {
      const container = document.getElementById('budget-form-container');
      container.innerHTML = '';
      CATEGORIES.forEach(function(cat) {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        const label = document.createElement('label');
        label.className = 'text-xs app-text-3 flex-1';
        label.textContent = cat.icon + ' ' + cat[currentLang];
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.id = 'budget-input-' + cat.id;
        input.value = budgetLimits[cat.id] || '';
        input.placeholder = '0';
        input.className = 'w-28 app-surface-1 border app-border-2 rounded-lg px-2 py-1.5 text-xs app-text-1 en-font focus:outline-none focus:border-violet-500';
        row.appendChild(label);
        row.appendChild(input);
        container.appendChild(row);
      });
      document.getElementById('budgetModal').classList.remove('hidden');
    }

    async function saveBudgets() {
      const limits = {};
      CATEGORIES.forEach(function(cat) {
        const input = document.getElementById('budget-input-' + cat.id);
        const v = parseFloat(input.value);
        if (!isNaN(v) && v > 0) limits[cat.id] = v;
      });
      try {
        await api('/api/budgets', { method: 'POST', body: { userId: currentUserId, limits: limits } });
        budgetLimits = limits;
        closeModal('budgetModal');
        renderBudgets();
      } catch (e) {
        showToast(t('saveFailed') + ': ' + e.message);
      }
    }

    function renderStreakBadges() {
      const streak = (dashboard && dashboard.streak) || 0;
      document.getElementById('streak-count').textContent = fmtNum(streak);

      const paidInstallments = installments.filter(function(i) { return !!i.lastPaidCycle; }).length;
      const stats = { totalTx: (summary && summary.totalTx) || 0, streak: streak, paidInstallments: paidInstallments };

      const strip = document.getElementById('badges-strip');
      strip.innerHTML = '';
      BADGE_DEFS.forEach(function(b) {
        const unlocked = b.test(stats);
        const chip = document.createElement('div');
        chip.className = 'badge-chip' + (unlocked ? ' unlocked' : '');
        const iconDiv = document.createElement('div');
        iconDiv.className = 'w-10 h-10 rounded-2xl app-surface-1 flex items-center justify-center text-lg';
        iconDiv.textContent = b.icon;
        const labelDiv = document.createElement('div');
        labelDiv.className = 'text-[9px] app-text-4 text-center leading-tight';
        labelDiv.textContent = b[currentLang];
        chip.appendChild(iconDiv);
        chip.appendChild(labelDiv);
        strip.appendChild(chip);
      });
    }

    // ---------- جریان مالی: درآمد و هزینه‌ی ماه انتخاب‌شده ----------
    // حلقه نشان می‌دهد چند درصد از درآمد ماه خرج شده؛ بخش سبز = باقی‌مانده‌ی درآمد.
    function renderFlow() {
      const inc = Number(monthStats.income) || 0;
      const exp = Number(monthStats.expense) || 0;
      const net = inc - exp;
      const hasData = (inc + exp) > 0;

      document.getElementById('flow-month').textContent = dashboard ? monthTitle(dashboard.month) : '';
      document.getElementById('flow-income').textContent = fmtMoney(inc);
      document.getElementById('flow-expense').textContent = fmtMoney(exp);
      const netEl = document.getElementById('flow-net');
      netEl.textContent = fmtMoney(net);
      netEl.className = 'amount-sensitive font-bold ' + (net >= 0 ? 'text-emerald-400' : 'text-rose-400');

      const centerValue = document.getElementById('flow-center-value');
      const centerLabel = document.getElementById('flow-center-label');
      const note = document.getElementById('flow-note');
      let chartData = [1];
      let chartColors = ['#374151'];

      if (!hasData) {
        centerValue.textContent = '-';
        centerValue.className = 'en-font text-base font-extrabold app-text-1';
        centerLabel.textContent = t('flowNoData');
        note.textContent = t('flowNoteEmpty');
      } else if (inc <= 0) {
        centerValue.textContent = '-';
        centerValue.className = 'en-font text-base font-extrabold text-rose-400';
        centerLabel.textContent = t('flowNoIncome');
        note.textContent = t('flowNoteNoIncome');
        chartData = [exp];
        chartColors = ['#f43f5e'];
      } else {
        const ratio = Math.round((exp / inc) * 100);
        centerValue.textContent = fmtNum(ratio) + '%';
        centerValue.className = 'amount-sensitive en-font text-base font-extrabold ' + (ratio > 100 ? 'text-rose-400' : (ratio > 80 ? 'text-amber-400' : 'text-emerald-400'));
        centerLabel.textContent = t('flowSpentOfIncome');
        if (exp >= inc) {
          chartData = [exp];
          chartColors = ['#f43f5e'];
          note.textContent = tf('flowNoteOver', { amount: fmtMoney(exp - inc) });
        } else {
          chartData = [exp, inc - exp];
          chartColors = ['#f43f5e', '#10b981'];
          note.textContent = tf('flowNoteOk', { amount: fmtMoney(net) });
        }
      }

      withChart(function() {
        const canvas = document.getElementById('ratioChart');
        if (!flowChart) {
          flowChart = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: chartData, backgroundColor: chartColors, borderWidth: 0 }] },
            options: { cutout: '74%', animation: { duration: 350 }, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
          });
        } else {
          flowChart.data.datasets[0].data = chartData;
          flowChart.data.datasets[0].backgroundColor = chartColors;
          flowChart.update();
        }
      });
    }

    // ---------- گزارشات ----------
    async function loadReportsData() {
      try {
        const data = await api('/api/reports?' + userQuery() + monthQuery());
        lastReportsData = data;
        renderReports(data);
        updateMonthStepper(data.month);
      } catch (err) {
        const empty = document.getElementById('reports-empty-state');
        empty.classList.remove('hidden');
        empty.textContent = t('loadErrDash');
      }
    }

    function pctChange(now, before) {
      if (!(before > 0)) return null;
      return Math.round(((now - before) / before) * 100);
    }

    function setDeltaText(el, label, pct, goodWhenDown) {
      el.innerHTML = '';
      if (pct === null) return;
      const sign = pct > 0 ? '+' : '';
      const bad = goodWhenDown ? pct > 0 : pct < 0;
      const span = document.createElement('span');
      span.className = pct === 0 ? 'app-text-4' : (bad ? 'text-rose-400' : 'text-emerald-400');
      span.textContent = label + ': ' + LRI + sign + fmtNum(pct) + '%' + PDI;
      el.appendChild(span);
    }

    function renderReports(data) {
      const cur = data.currentMonth;
      const prev = data.previousMonth;
      const forecast = data.forecast;
      const isCurrent = data.isCurrentMonth;

      const hasAnyData = cur.cumulativeIncome.some(function(v) { return v > 0; }) ||
                         cur.cumulativeExpense.some(function(v) { return v > 0; }) ||
                         prev.cumulativeIncome.some(function(v) { return v > 0; }) ||
                         prev.cumulativeExpense.some(function(v) { return v > 0; });
      document.getElementById('reports-empty-state').classList.toggle('hidden', hasAnyData);
      document.getElementById('reports-empty-state').textContent = t('reportsNoDataYet');
      document.getElementById('reports-chart-wrap').classList.toggle('hidden', !hasAnyData);

      const maxLen = Math.max(data.daysInMonth || cur.totalDays, prev.totalDays);
      const labels = [];
      for (let i = 1; i <= maxLen; i++) labels.push(fmtNum(i));
      const padToLength = function(arr, len) {
        const out = arr.slice();
        while (out.length < len) out.push(null);
        return out;
      };
      // نقطه‌ی آخر ماه جاری همیشه دیده شود (در روز اول ماه فقط یک نقطه داریم)
      const lastIdx = cur.totalDays - 1;
      const dotRadius = cur.cumulativeIncome.map(function(v, i) { return i === lastIdx ? 3 : 0; });

      withChart(function() {
        const ctx = document.getElementById('reportsChart').getContext('2d');
        if (reportsChartInstance) reportsChartInstance.destroy();
        reportsChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              { label: t('reportsChartLegendIncome'), data: padToLength(cur.cumulativeIncome, maxLen), borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.3, pointRadius: dotRadius },
              { label: t('reportsChartLegendExpense'), data: padToLength(cur.cumulativeExpense, maxLen), borderColor: '#f43f5e', backgroundColor: '#f43f5e', tension: 0.3, pointRadius: dotRadius },
              { label: t('reportsChartLegendIncomePrev'), data: padToLength(prev.cumulativeIncome, maxLen), borderColor: '#10b981', backgroundColor: 'transparent', borderDash: [4, 4], borderWidth: 1, tension: 0.3, pointRadius: 0 },
              { label: t('reportsChartLegendExpensePrev'), data: padToLength(prev.cumulativeExpense, maxLen), borderColor: '#f43f5e', backgroundColor: 'transparent', borderDash: [4, 4], borderWidth: 1, tension: 0.3, pointRadius: 0 }
            ]
          },
          options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#9ca3af', maxTicksLimit: 8 }, grid: { display: false } },
              y: { ticks: { color: '#9ca3af', callback: function(v) { return compactFmt().format(v); } }, grid: { color: 'rgba(156,163,175,0.1)' } }
            },
            interaction: { intersect: false, mode: 'index' }
          }
        });
      });

      document.getElementById('reports-forecast-title').textContent = isCurrent ? t('reportsForecastTitle') : t('reportsActualTitle');
      document.getElementById('reports-forecast-income').textContent = fmtMoney(forecast.projectedIncome);
      document.getElementById('reports-forecast-expense').textContent = fmtMoney(forecast.projectedExpense);
      const balEl = document.getElementById('reports-forecast-balance');
      balEl.textContent = fmtMoney(forecast.projectedBalance);
      balEl.className = 'amount-sensitive text-sm font-extrabold en-font mt-1 ' + (forecast.projectedBalance >= 0 ? 'text-emerald-400' : 'text-rose-400');

      document.getElementById('reports-forecast-note').textContent = isCurrent
        ? tf('reportsForecastNote', { pace: fmtMoney(forecast.dailyPace), inst: fmtMoney(forecast.pendingInstallments) })
        : '';

      const vs = document.getElementById('reports-vs-last-month');
      vs.innerHTML = '';
      const expDelta = pctChange(forecast.projectedExpense, prev.totals.expense);
      const incDelta = isCurrent ? null : pctChange(forecast.projectedIncome, prev.totals.income);
      const expSpan = document.createElement('div');
      const incSpan = document.createElement('div');
      setDeltaText(expSpan, t('reportsVsExpense'), expDelta, true);
      setDeltaText(incSpan, t('reportsVsIncome'), incDelta, false);
      vs.appendChild(expSpan);
      vs.appendChild(incSpan);

      renderReportCategories(data.categories || []);

      const ins = data.insights || {};
      document.getElementById('insight-avg-daily').textContent = fmtMoney(ins.avgDailyExpense);
      document.getElementById('insight-no-spend').textContent = fmtNum(ins.noSpendDays);
      document.getElementById('insight-biggest').textContent = ins.biggestExpense ? fmtMoney(ins.biggestExpense.amount) : '-';
      document.getElementById('insight-biggest-desc').textContent = ins.biggestExpense ? ins.biggestExpense.description : '';
    }

    function renderReportCategories(categories) {
      const container = document.getElementById('reports-categories');
      container.innerHTML = '';
      const total = categories.reduce(function(s, c) { return s + c.amount; }, 0);
      if (!categories.length || total <= 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center app-text-5 text-[11px] py-3';
        empty.textContent = t('reportsNoCategories');
        container.appendChild(empty);
        return;
      }
      categories.forEach(function(c) {
        const cat = getReportCategory(c.id);
        const pct = Math.round((c.amount / total) * 100);

        const row = document.createElement('div');
        const top = document.createElement('div');
        top.className = 'flex justify-between items-center text-[11px] mb-1';
        const label = document.createElement('span');
        label.className = 'app-text-3';
        label.textContent = cat ? (cat.icon + ' ' + cat[currentLang]) : c.id;
        const amt = document.createElement('span');
        amt.className = 'flex items-center gap-2 app-text-4';
        const amtText = document.createElement('span');
        amtText.className = 'amount-sensitive';
        amtText.textContent = fmtMoney(c.amount);
        const pctText = document.createElement('span');
        pctText.className = 'font-bold app-text-3';
        pctText.textContent = LRI + fmtNum(pct) + '%' + PDI;
        amt.appendChild(amtText);
        amt.appendChild(pctText);
        top.appendChild(label);
        top.appendChild(amt);

        const track = document.createElement('div');
        track.className = 'h-1.5 rounded-full bar-track overflow-hidden';
        const bar = document.createElement('div');
        bar.className = 'h-full rounded-full ' + (c.id === 'installments' ? 'bg-amber-500' : 'bg-indigo-500');
        bar.style.width = Math.max(pct, 2) + '%';
        track.appendChild(bar);

        row.appendChild(top);
        row.appendChild(track);
        container.appendChild(row);
      });
    }

    // ---------- تراکنش‌ها ----------
    function setFilter(filter) {
      activeFilter = filter;
      ['all', 'expense', 'income'].forEach(function(f) {
        const el = document.getElementById('tab-' + f);
        if (f === filter) el.className = 'tap flex-1 py-1.5 rounded-xl bg-indigo-600 font-semibold text-white transition';
        else el.className = 'tap flex-1 py-1.5 rounded-xl app-text-4 transition';
      });
      renderTransactionsList();
    }

    function createTransactionCard(item) {
      const isInc = item.type === 'income';
      const dateObj = new Date(item.date);
      const shamsiDate = dateObj.toLocaleDateString('fa-IR-u-ca-persian', { month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' });
      const gregDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Tehran' });
      const parsed = parseCategoryFromDescription(item.description);
      const cat = getCategory(parsed.categoryId);

      const card = document.createElement('div');
      card.className = 'card-glass p-3 rounded-2xl flex items-center justify-between fade-in';

      const left = document.createElement('div');
      left.className = 'flex items-center gap-3 min-w-0';

      const icon = document.createElement('div');
      icon.className = 'w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ' + (isInc ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400');
      icon.textContent = cat ? cat.icon : (isInc ? '↓' : '↑');

      const info = document.createElement('div');
      info.className = 'min-w-0';
      const descEl = document.createElement('div');
      descEl.className = 'font-semibold app-text-2 text-xs sm:text-sm truncate';
      descEl.textContent = parsed.clean || item.description;

      const dateRow = document.createElement('div');
      dateRow.className = 'text-[10px] app-text-4 mt-0.5 flex items-center gap-1.5 flex-wrap';
      const shamsiSpan = document.createElement('span');
      shamsiSpan.className = 'text-indigo-300';
      shamsiSpan.textContent = shamsiDate;
      const dot = document.createElement('span');
      dot.className = 'app-text-6';
      dot.textContent = '•';
      const gregSpan = document.createElement('span');
      gregSpan.className = 'app-text-5 en-font';
      gregSpan.textContent = gregDate;
      dateRow.appendChild(shamsiSpan);
      dateRow.appendChild(dot);
      dateRow.appendChild(gregSpan);
      if (cat) {
        const catSpan = document.createElement('span');
        catSpan.className = 'app-text-5';
        catSpan.textContent = '• ' + cat[currentLang];
        dateRow.appendChild(catSpan);
      }

      info.appendChild(descEl);
      info.appendChild(dateRow);
      left.appendChild(icon);
      left.appendChild(info);

      const right = document.createElement('div');
      right.className = 'flex items-center gap-2 flex-shrink-0';

      const amountEl = document.createElement('span');
      amountEl.className = 'amount-sensitive en-font font-extrabold text-xs sm:text-sm ' + (isInc ? 'text-emerald-400' : 'text-rose-400');
      amountEl.textContent = LRI + (isInc ? '+' : '-') + fmtMoney(item.amount) + PDI;

      const editBtn = document.createElement('button');
      editBtn.className = 'tap p-1.5 app-surface-hover rounded-lg app-text-4 text-xs';
      editBtn.textContent = '✏️';
      editBtn.onclick = function() { openEditModal(item.id); };

      const delBtn = document.createElement('button');
      delBtn.className = 'tap p-1.5 hover:bg-rose-950/40 rounded-lg text-rose-400 text-xs';
      delBtn.textContent = '🗑';
      delBtn.onclick = function() { deleteItem(item.id); };

      right.appendChild(amountEl);
      right.appendChild(editBtn);
      right.appendChild(delBtn);

      card.appendChild(left);
      card.appendChild(right);
      return card;
    }

    function renderTransactionsList() {
      const container = document.getElementById('items-container');
      container.innerHTML = '';
      const filtered = records.filter(function(r) { return activeFilter === 'all' || r.type === activeFilter; });
      document.getElementById('items-count').textContent = fmtNum(filtered.length) + ' ' + t('items');

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center app-text-5 py-8 text-xs';
        empty.textContent = t('noTransactions');
        container.appendChild(empty);
        return;
      }

      filtered.forEach(function(item) { container.appendChild(createTransactionCard(item)); });
    }

    function persianMonthKeyOf(dateInput) {
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', timeZone: 'Asia/Tehran' }).formatToParts(new Date(dateInput));
      const map = {};
      parts.forEach(function(p) { if (p.type === 'year' || p.type === 'month') map[p.type] = p.value; });
      return map.year + '-' + String(map.month).padStart(2, '0');
    }

    function openNewModal() {
      document.getElementById('modal-title').textContent = t('newTransaction');
      document.getElementById('entry-id').value = '';
      document.getElementById('entry-desc').value = '';
      document.getElementById('entry-amount').value = '';
      document.getElementById('entry-type').value = 'expense';
      document.getElementById('entry-category').value = '';
      document.getElementById('entryModal').classList.remove('hidden');
    }

    function openEditModal(id) {
      const item = records.find(function(r) { return r.id === id; });
      if (!item) return;
      const parsed = parseCategoryFromDescription(item.description);
      document.getElementById('modal-title').textContent = t('editTransaction');
      document.getElementById('entry-id').value = item.id;
      document.getElementById('entry-desc').value = parsed.clean;
      document.getElementById('entry-amount').value = item.amount;
      document.getElementById('entry-type').value = item.type;
      document.getElementById('entry-category').value = parsed.categoryId || '';
      document.getElementById('entryModal').classList.remove('hidden');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.add('hidden');
    }

    async function saveEntry() {
      const id = document.getElementById('entry-id').value;
      const descRaw = document.getElementById('entry-desc').value;
      const amount = document.getElementById('entry-amount').value;
      const type = document.getElementById('entry-type').value;
      const categoryId = document.getElementById('entry-category').value;
      const description = buildDescriptionWithCategory(descRaw, categoryId);

      if (!amount || !(parseFloat(amount) > 0)) { alert(t('alertAmount')); return; }

      try {
        if (id) {
          const existing = records.find(function(r) { return r.id === id; });
          const monthKey = existing ? persianMonthKeyOf(existing.date) : persianMonthKeyOf(new Date());
          await api('/api/update', { method: 'POST', body: { id: id, userId: currentUserId, month: monthKey, description: description, amount: amount, type: type } });
        } else {
          await api('/api/add', { method: 'POST', body: { userId: currentUserId, description: description, amount: amount, type: type } });
          selectedMonth = null; // تراکنش جدید همیشه در ماه جاری ثبت می‌شود
        }
        closeModal('entryModal');
        loadDashboardData();
      } catch (e) {
        showToast(t('saveFailed') + ': ' + e.message);
      }
    }

    async function deleteItem(id) {
      if (!confirm(t('confirmDeleteTx'))) return;
      const existing = records.find(function(r) { return r.id === id; });
      const monthKey = existing ? persianMonthKeyOf(existing.date) : persianMonthKeyOf(new Date());
      try {
        await api('/api/delete', { method: 'POST', body: { id: id, userId: currentUserId, month: monthKey } });
        loadDashboardData();
      } catch (e) {
        showToast(t('saveFailed') + ': ' + e.message);
      }
    }

    // ---------- اقساط ----------
    function renderInstallments() {
      let pendingTotal = 0;
      installments.forEach(function(i) { if (i.isDueThisMonth && !i.isPaidThisCycle) pendingTotal += Number(i.amount) || 0; });
      document.getElementById('inst-total').textContent = fmtMoney(pendingTotal);
      document.getElementById('inst-count').textContent = fmtNum(installments.length) + ' ' + t('items');

      const container = document.getElementById('inst-container');
      container.innerHTML = '';

      if (installments.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center app-text-5 py-8 text-xs';
        empty.textContent = t('noInstallments');
        container.appendChild(empty);
        return;
      }

      installments.forEach(function(item) { container.appendChild(createInstallmentCard(item)); });
    }

    function createInstallmentCard(item) {
      const card = document.createElement('div');
      card.className = 'card-glass p-3.5 rounded-2xl fade-in';

      const topRow = document.createElement('div');
      topRow.className = 'flex items-center justify-between';

      const left = document.createElement('div');
      left.className = 'flex items-center gap-3 min-w-0';

      const dayBadge = document.createElement('div');
      dayBadge.className = 'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs en-font flex-shrink-0 ' + (item.isOverdue ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400');
      dayBadge.textContent = fmtNum(item.effectiveDueDay || item.dueDay);

      const info = document.createElement('div');
      info.className = 'min-w-0';
      const titleEl = document.createElement('div');
      titleEl.className = 'font-semibold app-text-2 text-xs sm:text-sm truncate';
      titleEl.textContent = item.title;

      const subRow = document.createElement('div');
      subRow.className = 'text-[10px] app-text-4 mt-0.5';
      const monthsArr = MONTHS[currentLang];
      const recurrenceLabel = item.recurrenceType === 'yearly'
        ? (t('recurrenceYearlyBadge') + ' • ' + monthsArr[(item.dueMonth || 1) - 1] + ' ' + t('dueDayWord') + ' ' + fmtNum(item.dueDay))
        : (t('recurrenceMonthlyBadge') + ' • ' + t('dueDayWord') + ' ' + fmtNum(item.dueDay) + ' ' + t('everyMonthWord'));
      subRow.textContent = recurrenceLabel + (item.notes ? (' • ' + item.notes) : '');

      info.appendChild(titleEl);
      info.appendChild(subRow);
      left.appendChild(dayBadge);
      left.appendChild(info);

      const amountEl = document.createElement('div');
      amountEl.className = 'amount-sensitive font-bold text-xs sm:text-sm text-amber-300 text-left flex-shrink-0';
      amountEl.textContent = fmtMoney(item.amount);

      topRow.appendChild(left);
      topRow.appendChild(amountEl);

      const bottomRow = document.createElement('div');
      bottomRow.className = 'flex items-center justify-between mt-3 pt-3 border-t app-border-1';

      const statusBadge = document.createElement('span');
      if (!item.isDueThisMonth) {
        statusBadge.className = 'text-[10px] px-2 py-1 rounded-full app-surface-1 app-text-5';
        statusBadge.textContent = t('instNotDueThisMonth');
      } else if (item.isPaidThisCycle) {
        statusBadge.className = 'text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400';
        statusBadge.textContent = t('instPaidThisCycle');
      } else if (item.isOverdue) {
        statusBadge.className = 'text-[10px] px-2 py-1 rounded-full bg-rose-500/15 text-rose-400';
        statusBadge.textContent = tf('instOverdue', { n: fmtNum(Math.abs(item.daysUntilDue)) });
      } else if (item.daysUntilDue === 0) {
        statusBadge.className = 'text-[10px] px-2 py-1 rounded-full bg-amber-500/25 text-amber-300';
        statusBadge.textContent = t('instToday');
      } else if (item.daysUntilDue === 1) {
        statusBadge.className = 'text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400';
        statusBadge.textContent = t('instTomorrow');
      } else if (item.daysUntilDue > 1 && item.daysUntilDue <= 5) {
        statusBadge.className = 'text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400';
        statusBadge.textContent = tf('instInDays', { n: fmtNum(item.daysUntilDue) });
      } else {
        statusBadge.className = 'text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400';
        statusBadge.textContent = t('instPending');
      }

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2';

      if (item.isDueThisMonth && !item.isPaidThisCycle) {
        const payBtn = document.createElement('button');
        payBtn.className = 'tap px-2.5 py-1 bg-emerald-600/25 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg text-[11px] font-medium transition';
        payBtn.textContent = t('payBtn');
        payBtn.onclick = function() { payInstallment(item.id); };
        actions.appendChild(payBtn);
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'tap p-1.5 app-text-4 app-surface-hover rounded-lg text-xs';
      editBtn.textContent = '✏️';
      editBtn.onclick = function() { openEditInstModal(item.id); };

      const delBtn = document.createElement('button');
      delBtn.className = 'tap p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg text-xs';
      delBtn.textContent = '🗑';
      delBtn.onclick = function() { deleteInstallment(item.id); };

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      bottomRow.appendChild(statusBadge);
      bottomRow.appendChild(actions);

      card.appendChild(topRow);
      card.appendChild(bottomRow);
      return card;
    }

    async function payInstallment(id) {
      if (!confirm(t('confirmPayInst'))) return;
      try {
        await api('/api/installments/pay', { method: 'POST', body: { id: id, userId: currentUserId } });
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      } catch (e) {
        showToast(e.status === 409 ? t('alreadyPaid') : (t('saveFailed') + ': ' + e.message));
      }
      loadInstallmentsData();
      dashboard = null; // پرداخت قسط یک هزینه‌ی جدید می‌سازد؛ داشبورد باید دوباره خوانده شود
    }

    async function deleteInstallment(id) {
      if (!confirm(t('confirmDeleteInst'))) return;
      try {
        await api('/api/installments/delete', { method: 'POST', body: { id: id, userId: currentUserId } });
      } catch (e) {
        showToast(t('saveFailed') + ': ' + e.message);
      }
      loadInstallmentsData();
      dashboard = null;
    }

    function setRecurrence(type) {
      currentRecurrence = type;
      const monthlyBtn = document.getElementById('rec-monthly-btn');
      const yearlyBtn = document.getElementById('rec-yearly-btn');
      const monthWrap = document.getElementById('inst-month-wrap');
      if (type === 'monthly') {
        monthlyBtn.className = 'tap py-2 rounded-lg bg-amber-600 text-white';
        yearlyBtn.className = 'tap py-2 rounded-lg app-text-4';
        monthWrap.classList.add('hidden');
      } else {
        yearlyBtn.className = 'tap py-2 rounded-lg bg-amber-600 text-white';
        monthlyBtn.className = 'tap py-2 rounded-lg app-text-4';
        monthWrap.classList.remove('hidden');
      }
    }

    function openNewInstModal() {
      document.getElementById('inst-modal-title').textContent = t('newInstallment');
      document.getElementById('inst-id').value = '';
      document.getElementById('inst-title').value = '';
      document.getElementById('inst-amount').value = '';
      document.getElementById('inst-day').value = '';
      document.getElementById('inst-notes').value = '';
      document.getElementById('inst-month').value = '1';
      setRecurrence('monthly');
      document.getElementById('instModal').classList.remove('hidden');
    }

    function openEditInstModal(id) {
      const item = installments.find(function(i) { return i.id === id; });
      if (!item) return;
      document.getElementById('inst-modal-title').textContent = t('editInstallment');
      document.getElementById('inst-id').value = item.id;
      document.getElementById('inst-title').value = item.title;
      document.getElementById('inst-amount').value = item.amount;
      document.getElementById('inst-day').value = item.dueDay;
      document.getElementById('inst-notes').value = item.notes || '';
      document.getElementById('inst-month').value = String(item.dueMonth || 1);
      setRecurrence(item.recurrenceType === 'yearly' ? 'yearly' : 'monthly');
      document.getElementById('instModal').classList.remove('hidden');
    }

    async function saveInstallment() {
      const id = document.getElementById('inst-id').value;
      const title = document.getElementById('inst-title').value;
      const amount = document.getElementById('inst-amount').value;
      const dueDay = document.getElementById('inst-day').value;
      const dueMonth = document.getElementById('inst-month').value;
      const notes = document.getElementById('inst-notes').value;

      if (!title || !amount || !dueDay) { alert(t('alertInstFields')); return; }

      const payload = { userId: currentUserId, title: title, amount: amount, dueDay: dueDay, dueMonth: dueMonth, recurrenceType: currentRecurrence, notes: notes };
      try {
        if (id) {
          payload.id = id;
          await api('/api/installments/edit', { method: 'POST', body: payload });
        } else {
          await api('/api/installments/add', { method: 'POST', body: payload });
        }
        closeModal('instModal');
        loadInstallmentsData();
        dashboard = null;
      } catch (e) {
        showToast(t('saveFailed') + ': ' + e.message);
      }
    }

    // ---------- پشتیبان‌گیری و حذف داده‌ها ----------
    async function exportData() {
      document.getElementById('settings-popover').classList.add('hidden');
      if (!initData) { showToast(t('needTelegram')); return; }
      showToast(t('exportSending'));
      try {
        await api('/api/data/export', { method: 'POST', body: {} });
        showToast(t('exportSent'));
      } catch (e) {
        showToast(t('exportFailed'));
      }
    }

    function selectedDeleteScope() {
      const checked = document.querySelector('input[name="delete-scope"]:checked');
      return checked ? checked.value : '';
    }

    function onDeleteFormChange() {
      const typed = document.getElementById('delete-confirm-input').value.trim().toLowerCase();
      const ok = !!selectedDeleteScope() && typed === t('deleteWord').toLowerCase();
      const btn = document.getElementById('delete-confirm-btn');
      btn.disabled = !ok;
      btn.classList.toggle('opacity-40', !ok);
    }

    function openDeleteModal() {
      document.getElementById('settings-popover').classList.add('hidden');
      if (!initData) { showToast(t('needTelegram')); return; }
      document.querySelectorAll('input[name="delete-scope"]').forEach(function(r) { r.checked = false; });
      document.getElementById('delete-confirm-input').value = '';
      document.getElementById('delete-word').textContent = t('deleteWord');
      onDeleteFormChange();
      document.getElementById('deleteModal').classList.remove('hidden');
    }

    async function confirmDeleteData() {
      const scope = selectedDeleteScope();
      if (!scope) return;
      const btn = document.getElementById('delete-confirm-btn');
      btn.disabled = true;
      try {
        await api('/api/data/delete', { method: 'POST', body: { scope: scope, confirm: 'DELETE' } });
        closeModal('deleteModal');
        showToast(t('deleteDone'));
        selectedMonth = null;
        lastReportsData = null;
        dashboard = null;
        await loadDashboardData();
        if (activeMainTab === 'reports') loadReportsData();
        if (activeMainTab === 'installments') loadInstallmentsData();
      } catch (e) {
        showToast(t('deleteFailed') + ': ' + e.message);
        onDeleteFormChange();
      }
    }

    // ---------- راه‌اندازی اولیه ----------
    applyTheme();
    applyLanguage();
    applyAmountVisibility();
    loadDashboardData();
  </script>
</body>
</html>`;

export function renderFullMiniApp(baseUrl) {
  return '<!DOCTYPE html>' + MINI_APP_HTML.replace(/__BASE_URL__/g, baseUrl);
}
