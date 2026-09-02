export default {
  // ۱. هندلر وب و APIها
  async fetch(request, env) {
    const url = new URL(request.url);
    const kv = env.PERSONALFIN || env.EXPENSE_KV;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ============================================================
    // بخش‌های زیر دقیقاً مطابق نسخه‌ی قبلی هستند و دست نخورده باقی مانده‌اند
    // (مسیرها، نام پارامترها و پاسخ‌ها بدون تغییر: چون لینک‌های آن‌ها
    // در حال استفاده هستند - iOS Shortcut / webhook / add / update / delete / transactions)
    // ============================================================

    // الف) اندپوینت اختصاصی iOS Shortcuts با متد GET
    if (url.pathname === '/api/shortcut' && request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      const amountStr = url.searchParams.get('amount');
      const desc = url.searchParams.get('desc') || url.searchParams.get('description') || 'Shortcut Entry';
      const type = (url.searchParams.get('type') || 'expense').toLowerCase();

      if (!userId || !amountStr) {
        return Response.json({ success: false, error: 'userId and amount are required' }, { status: 400, headers: corsHeaders });
      }

      const numAmount = parseFloat(convertPersianDigits(amountStr).replace(/,/g, ''));
      if (isNaN(numAmount) || numAmount <= 0) {
        return Response.json({ success: false, error: 'Invalid amount' }, { status: 400, headers: corsHeaders });
      }

      const isInc = (type === 'income' || type === 'in' || type === 'واریز');
      const newRecord = {
        id: Date.now().toString(),
        type: isInc ? 'income' : 'expense',
        amount: Math.abs(numAmount),
        description: desc.trim(),
        date: new Date().toISOString()
      };

      await ensureMigrated(kv, userId);
      const monthKey = monthKeyOf(new Date(newRecord.date));
      const raw = await kv.get(`user_${userId}_${monthKey}`);
      let list = raw ? JSON.parse(raw) : [];
      list.unshift(newRecord);
      await kv.put(`user_${userId}_${monthKey}`, JSON.stringify(list));
      await addMonthToIndex(kv, userId, monthKey);

      await saveUserIndex(kv, userId);

      const persianDate = getPersianFormattedDate(new Date());
      const sign = isInc ? '🟢 Income (Shortcut)' : '🔴 Expense (Shortcut)';
      const msg =
        `⚡️ <b>Saved via iOS Shortcut!</b>\n\n` +
        `• <b>Type:</b> ${sign}\n` +
        `• <b>Amount:</b> <code>$${numAmount.toLocaleString('en-US')}</code>\n` +
        `• <b>Note:</b> ${escapeHtml(desc)}\n` +
        `• <b>Date:</b> ${persianDate}`;

      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, userId, msg, `${url.origin}/app?uid=${userId}`);

      return Response.json({
        success: true,
        message: `Saved ${isInc ? 'Income' : 'Expense'}: $${numAmount.toLocaleString('en-US')} (${desc})`,
        record: newRecord
      }, { headers: corsHeaders });
    }

    // ب) تنظیم خودکار وبهوک تلگرام
    if (url.pathname === '/set-webhook') {
      const webhookUrl = `${url.origin}/`;
      const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const data = await res.json();
      return Response.json({ status: data.ok ? "SUCCESS" : "FAILED", telegram: data });
    }

    // ج) فرانت‌اند Mini App (فقط ظاهر و ویژگی‌های اقساط بازطراحی شده - آدرس مسیر عوض نشده)
    if (url.pathname === '/app') {
      return new Response(renderFullMiniApp(url.origin), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // د) APIهای تراکنش‌ها (بدون تغییر)
    if (url.pathname === '/api/transactions' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        await ensureMigrated(kv, userId);
        const requestedMonth = url.searchParams.get('month');
        const isValidMonthParam = requestedMonth && (/^\d{4}-\d{2}$/.test(requestedMonth) || requestedMonth === 'unknown-date');
        const monthKey = isValidMonthParam ? requestedMonth : monthKeyOf(new Date());
        const raw = await kv.get(`user_${userId}_${monthKey}`);
        return Response.json(raw ? JSON.parse(raw) : [], { headers: corsHeaders });
      } catch (err) {
        return Response.json([], { headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/add' && request.method === 'POST') {
      try {
        const { userId, type, amount, description } = await request.json();
        const targetUser = userId || 'guest_user';
        await ensureMigrated(kv, targetUser);
        const numAmount = parseFloat(String(amount).replace(/,/g, '')) || 0;
        const newRecord = {
          id: Date.now().toString(),
          type: type || 'expense',
          amount: Math.abs(numAmount),
          description: (description || 'General').trim(),
          date: new Date().toISOString()
        };
        const monthKey = monthKeyOf(new Date(newRecord.date));
        const raw = await kv.get(`user_${targetUser}_${monthKey}`);
        let list = raw ? JSON.parse(raw) : [];
        list.unshift(newRecord);
        await kv.put(`user_${targetUser}_${monthKey}`, JSON.stringify(list));
        await addMonthToIndex(kv, targetUser, monthKey);
        await saveUserIndex(kv, targetUser);
        return Response.json({ success: true, item: newRecord }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/delete' && request.method === 'POST') {
      try {
        const { id, userId, month } = await request.json();
        await ensureMigrated(kv, userId);
        const baseMonthKey = month || monthKeyOf(new Date());
        // اول در ماه اعلام‌شده توسط کلاینت جست‌وجو کن؛ اگر پیدا نشد (مثلاً به‌خاطر یک
        // کلید ماه قدیمی/نادرست در سمت کلاینت) دو ماه همسایه را هم به‌عنوان راه‌حل
        // پشتیبان امتحان کن، قبل از این‌که واقعاً شکست را گزارش کنیم.
        const candidateMonths = [baseMonthKey, shiftMonthKey(baseMonthKey, 1), shiftMonthKey(baseMonthKey, -1)];
        let found = false;
        for (const monthKey of candidateMonths) {
          const raw = await kv.get(`user_${userId}_${monthKey}`);
          if (!raw) continue;
          const list = JSON.parse(raw);
          const filtered = list.filter(item => item.id !== id);
          if (filtered.length !== list.length) {
            await kv.put(`user_${userId}_${monthKey}`, JSON.stringify(filtered));
            found = true;
            break;
          }
        }
        if (!found) {
          return Response.json({ success: false, error: 'Transaction not found' }, { status: 404, headers: corsHeaders });
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/update' && request.method === 'POST') {
      try {
        const { id, amount, description, type, userId, month } = await request.json();
        await ensureMigrated(kv, userId);
        const baseMonthKey = month || monthKeyOf(new Date());
        // اول در ماه اعلام‌شده توسط کلاینت جست‌وجو کن؛ اگر پیدا نشد دو ماه همسایه را هم
        // امتحان کن (نگاه کن به توضیح مشابه در /api/delete بالا).
        const candidateMonths = [baseMonthKey, shiftMonthKey(baseMonthKey, 1), shiftMonthKey(baseMonthKey, -1)];
        let found = false;
        for (const monthKey of candidateMonths) {
          const raw = await kv.get(`user_${userId}_${monthKey}`);
          if (!raw) continue;
          const list = JSON.parse(raw);
          const idx = list.findIndex(item => item.id === id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], amount: Math.abs(parseFloat(amount) || 0), description, type };
            await kv.put(`user_${userId}_${monthKey}`, JSON.stringify(list));
            found = true;
            break;
          }
        }
        if (!found) {
          return Response.json({ success: false, error: 'Transaction not found' }, { status: 404, headers: corsHeaders });
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ============================================================
    // از این‌جا به بعد: بخش اقساط بازطراحی شده + مسیرهای جدید
    // ============================================================

    // APIهای مدیریت اقساط (Installments) - اکنون با روز + ماه شمسی، نوع تکرار (ماهانه/سالانه)
    // و وضعیت پرداخت هر دوره (lastPaidCycle) و یادآوری هر دوره (lastReminderCycle)
    if (url.pathname === '/api/installments' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        const raw = await kv.get(`installments_${userId}`);
        const list = raw ? JSON.parse(raw) : [];
        const now = toPersianDate(new Date());
        const currentCycle = cycleKey(now);
        const enriched = list.map(item => ({
          ...item,
          isPaidThisCycle: item.lastPaidCycle === currentCycle,
          isDueThisMonth: item.recurrenceType === 'yearly' ? item.dueMonth === now.month : true
        }));
        return Response.json(enriched, { headers: corsHeaders });
      } catch (err) {
        return Response.json([], { headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/installments/add' && request.method === 'POST') {
      try {
        const { userId, title, amount, dueDay, dueMonth, recurrenceType, notes } = await request.json();
        const type = recurrenceType === 'yearly' ? 'yearly' : 'monthly';
        const newInst = {
          id: newId(),
          title: (title || 'Installment').trim(),
          amount: Math.abs(parseFloat(String(amount).replace(/,/g, '')) || 0),
          dueDay: Math.min(31, Math.max(1, parseInt(dueDay, 10) || 1)),
          dueMonth: type === 'yearly' ? Math.min(12, Math.max(1, parseInt(dueMonth, 10) || 1)) : null,
          recurrenceType: type,
          notes: (notes || '').trim(),
          lastPaidCycle: null,
          lastReminderCycle: null,
          createdAt: new Date().toISOString()
        };
        const raw = await kv.get(`installments_${userId}`);
        let list = raw ? JSON.parse(raw) : [];
        list.push(newInst);
        await kv.put(`installments_${userId}`, JSON.stringify(list));
        await saveUserIndex(kv, userId);
        await upsertInstallmentIndex(kv, userId, newInst);
        return Response.json({ success: true, item: newInst }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ویرایش قسط (اندپوینت جدید)
    if (url.pathname === '/api/installments/edit' && request.method === 'POST') {
      try {
        const { id, userId, title, amount, dueDay, dueMonth, recurrenceType, notes } = await request.json();
        const raw = await kv.get(`installments_${userId}`);
        let list = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex(i => i.id === id);
        if (idx === -1) {
          return Response.json({ error: 'Installment not found' }, { status: 404, headers: corsHeaders });
        }
        const type = recurrenceType === 'yearly' ? 'yearly' : 'monthly';
        list[idx] = {
          ...list[idx],
          title: (title || list[idx].title).trim(),
          amount: Math.abs(parseFloat(String(amount).replace(/,/g, '')) || list[idx].amount),
          dueDay: Math.min(31, Math.max(1, parseInt(dueDay, 10) || list[idx].dueDay)),
          dueMonth: type === 'yearly' ? Math.min(12, Math.max(1, parseInt(dueMonth, 10) || 1)) : null,
          recurrenceType: type,
          notes: (notes ?? list[idx].notes ?? '').trim()
        };
        await kv.put(`installments_${userId}`, JSON.stringify(list));
        await upsertInstallmentIndex(kv, userId, list[idx]);
        return Response.json({ success: true, item: list[idx] }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/installments/delete' && request.method === 'POST') {
      try {
        const { id, userId } = await request.json();
        const raw = await kv.get(`installments_${userId}`);
        let list = raw ? JSON.parse(raw) : [];
        list = list.filter(item => item.id !== id);
        await kv.put(`installments_${userId}`, JSON.stringify(list));
        await removeFromInstallmentIndex(kv, userId, id);
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // دکمه پرداخت سریع قسط (هزینه را در تراکنش‌ها می‌نشاند و دوره‌ی پرداخت را ثبت می‌کند)
    if (url.pathname === '/api/installments/pay' && request.method === 'POST') {
      try {
        const { id, userId } = await request.json();
        const rawInst = await kv.get(`installments_${userId}`);
        let instList = rawInst ? JSON.parse(rawInst) : [];
        const idx = instList.findIndex(i => i.id === id);
        if (idx === -1) return Response.json({ error: 'Installment not found' }, { status: 404, headers: corsHeaders });
        const inst = instList[idx];

        const now = toPersianDate(new Date());
        inst.lastPaidCycle = cycleKey(now);

        const txRecord = {
          id: newId(),
          type: 'expense',
          amount: inst.amount,
          description: `پرداخت قسط: ${inst.title}`,
          date: new Date().toISOString()
        };

        await ensureMigrated(kv, userId);
        const txMonthKey = monthKeyOf(new Date(txRecord.date));
        const rawTx = await kv.get(`user_${userId}_${txMonthKey}`);
        let txList = rawTx ? JSON.parse(rawTx) : [];
        txList.unshift(txRecord);
        await kv.put(`user_${userId}_${txMonthKey}`, JSON.stringify(txList));
        await addMonthToIndex(kv, userId, txMonthKey);
        await kv.put(`installments_${userId}`, JSON.stringify(instList));
        await upsertInstallmentIndex(kv, userId, inst);

        return Response.json({ success: true, transaction: txRecord, item: inst }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // بودجه‌ی ماهانه‌ی هر دسته‌بندی - مسیر کاملاً جدید، تداخلی با اندپوینت‌های محافظت‌شده ندارد
    if (url.pathname === '/api/budgets' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        const raw = await kv.get(`budgets_${userId}`);
        const limits = raw ? JSON.parse(raw) : {};
        return Response.json({ limits }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ limits: {} }, { headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/budgets' && request.method === 'POST') {
      try {
        const { userId, limits } = await request.json();
        const targetUser = userId || 'guest_user';
        const safeLimits = {};
        if (limits && typeof limits === 'object') {
          for (const key of Object.keys(limits)) {
            const n = parseFloat(String(limits[key]).replace(/,/g, ''));
            if (!isNaN(n) && n >= 0) safeLimits[key] = n;
          }
        }
        await kv.put(`budgets_${targetUser}`, JSON.stringify(safeLimits));
        return Response.json({ success: true, limits: safeLimits }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // برآیند مالی: موجودی فعلی، اقساط باقیمانده‌ی این ماه و موجودی پیش‌بینی‌شده پس از پرداخت آن‌ها
    if (url.pathname === '/api/summary' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        const summary = await computeSummary(kv, userId);
        return Response.json(summary, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/reports' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        await ensureMigrated(kv, userId);
        const now = new Date();
        const nowP = toPersianDate(now);
        const currentKey = cycleKey(nowP);
        const prevKey = shiftMonthKey(currentKey, -1);

        const [currentRaw, prevRaw] = await Promise.all([
          kv.get(`user_${userId}_${currentKey}`),
          kv.get(`user_${userId}_${prevKey}`)
        ]);
        const currentRecords = currentRaw ? JSON.parse(currentRaw) : [];
        const prevRecords = prevRaw ? JSON.parse(prevRaw) : [];

        const daysElapsed = nowP.day;
        const totalDaysCurrent = daysInPersianMonth(now);
        const prevMonthProbeDate = new Date(now.getTime() - daysElapsed * 86400000);
        const totalDaysPrev = daysInPersianMonth(prevMonthProbeDate);
        const prevMonthLabel = PERSIAN_MONTHS[toPersianDate(prevMonthProbeDate).month - 1];

        const currentBuckets = bucketDaily(currentRecords, daysElapsed);
        const prevBuckets = bucketDaily(prevRecords, totalDaysPrev);

        const incomeSoFar = daysElapsed > 0 ? currentBuckets.cumulativeIncome[daysElapsed - 1] : 0;
        const expenseSoFar = daysElapsed > 0 ? currentBuckets.cumulativeExpense[daysElapsed - 1] : 0;
        const projectedIncome = daysElapsed > 0 ? (incomeSoFar / daysElapsed) * totalDaysCurrent : 0;
        const projectedExpense = daysElapsed > 0 ? (expenseSoFar / daysElapsed) * totalDaysCurrent : 0;

        return Response.json({
          currentMonth: {
            label: PERSIAN_MONTHS[nowP.month - 1],
            totalDays: daysElapsed,
            dailyIncome: currentBuckets.dailyIncome,
            dailyExpense: currentBuckets.dailyExpense,
            cumulativeIncome: currentBuckets.cumulativeIncome,
            cumulativeExpense: currentBuckets.cumulativeExpense
          },
          previousMonth: {
            label: prevMonthLabel,
            totalDays: totalDaysPrev,
            dailyIncome: prevBuckets.dailyIncome,
            dailyExpense: prevBuckets.dailyExpense,
            cumulativeIncome: prevBuckets.cumulativeIncome,
            cumulativeExpense: prevBuckets.cumulativeExpense
          },
          forecast: {
            projectedIncome: Math.round(projectedIncome),
            projectedExpense: Math.round(projectedExpense),
            projectedBalance: Math.round(projectedIncome - projectedExpense)
          }
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // و) پردازش پیام‌های ورودی تلگرام
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        const message = update.message || update.edited_message;
        if (!message || !message.text) return new Response('OK');

        const chatId = message.chat.id;
        const userId = message.from?.id ? message.from.id.toString() : chatId.toString();
        const text = message.text.trim();
        const userAppUrl = `${url.origin}/app?uid=${userId}`;

        if (text === '/start') {
          const welcome =
            `👋 <b>Welcome to Finance Tracker!</b>\n\n` +
            `• <code>expense - 50 - Lunch</code>\n` +
            `• <code>income - 2500 - Salary</code>\n` +
            `• <code>input- 1000- Shopping</code>\n\n` +
            `Use the button below to view transactions & installments! 📊\n` +
            `دستور <code>گزارش</code> را بفرستید تا خلاصه‌ی وضعیت مالی و اقساط این ماه را ببینید.`;
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, welcome, userAppUrl);
          return new Response('OK');
        }

        // دستور جدید و افزوده‌شده: گزارش خلاصه مالی از طریق چت (تراکنش‌ها و اقساط تغییری نکرده‌اند)
        if (text === '/report' || text === 'گزارش' || text === '/گزارش') {
          const summary = await computeSummary(kv, userId);
          const reportMsg = buildSummaryMessage(summary);
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, reportMsg, userAppUrl);
          return new Response('OK');
        }

        const parsed = parseTransaction(text);
        if (parsed) {
          const newRecord = {
            id: Date.now().toString(),
            type: parsed.type,
            amount: parsed.amount,
            description: parsed.description,
            date: new Date().toISOString()
          };

          await ensureMigrated(kv, userId);
          const txMonthKey = monthKeyOf(new Date(newRecord.date));
          const raw = await kv.get(`user_${userId}_${txMonthKey}`);
          let userTransactions = raw ? JSON.parse(raw) : [];
          userTransactions.unshift(newRecord);
          await kv.put(`user_${userId}_${txMonthKey}`, JSON.stringify(userTransactions));
          await addMonthToIndex(kv, userId, txMonthKey);
          await saveUserIndex(kv, userId);

          const persianDate = getPersianFormattedDate(new Date());
          const sign = parsed.type === 'income' ? '🟢 Income' : '🔴 Expense';
          const msg =
            `✅ <b>Transaction Saved!</b>\n\n` +
            `• <b>Type:</b> ${sign}\n` +
            `• <b>Amount:</b> <code>$${parsed.amount.toLocaleString('en-US')}</code>\n` +
            `• <b>Note:</b> ${escapeHtml(parsed.description)}\n` +
            `• <b>Date:</b> ${persianDate}`;

          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg, userAppUrl);
        } else {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Format: <code>expense - 50 - Coffee</code>`, userAppUrl);
        }
        return new Response('OK');
      } catch (err) {
        return new Response('OK');
      }
    }

    return new Response('Worker running.');
  },

  // ۲. کران‌جاب روزانه‌ی کلادفلر - بازطراحی‌شده برای کمینه‌کردن فشار روی KV
  // به‌جای خواندن جداگانه‌ی اقساط هر کاربر (که با رشد تعداد کاربران به سقف درخواست‌های KV می‌خورد)،
  // یک ایندکس سبک از همه‌ی اقساط در یک کلید واحد نگه‌داری می‌شود و کران فقط همان یک کلید را می‌خواند.
  // فقط برای کاربرانی که واقعاً پیامی برایشان ارسال شده، رکورد جزئیات به‌روزرسانی می‌شود.
  async scheduled(event, env, ctx) {
    const kv = env.PERSONALFIN || env.EXPENSE_KV;
    if (!kv || !env.TELEGRAM_BOT_TOKEN) return;

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tP = toPersianDate(tomorrow);
    const tCycle = cycleKey(tP);
    const tomorrowLabel = getPersianFormattedDate(tomorrow);

    const rawIndex = await kv.get('system_installments_index');
    if (!rawIndex) return;

    let index;
    try {
      index = JSON.parse(rawIndex);
    } catch (e) {
      return;
    }
    if (!Array.isArray(index) || index.length === 0) return;

    let indexChanged = false;
    const perUserTouched = {};

    for (const entry of index) {
      const dayMatches = entry.dueDay === tP.day;
      const cycleMatches = entry.recurrenceType === 'yearly' ? entry.dueMonth === tP.month : true;
      const alreadyReminded = entry.lastReminderCycle === tCycle;
      const alreadyPaid = entry.lastPaidCycle === tCycle;

      if (dayMatches && cycleMatches && !alreadyReminded && !alreadyPaid) {
        const reminderMsg =
          `⏰ <b>یادآوری سررسید قسط (فردا)</b>\n\n` +
          `📌 <b>عنوان:</b> ${escapeHtml(entry.title)}\n` +
          `💰 <b>مبلغ قسط:</b> ${toman(entry.amount)}\n` +
          `🗓 <b>موعد پرداخت:</b> فردا (${tomorrowLabel})\n\n` +
          `_برای ثبت پرداخت از تب «اقساط» در مینی‌اپ اقدام کنید._`;

        try {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, entry.userId, reminderMsg);
          entry.lastReminderCycle = tCycle;
          indexChanged = true;
          if (!perUserTouched[entry.userId]) perUserTouched[entry.userId] = [];
          perUserTouched[entry.userId].push(entry.id);
        } catch (e) {
          // اگر ارسال یک پیام شکست خورد، ادامه‌ی حلقه برای بقیه‌ی اقساط ادامه پیدا می‌کند
        }
      }
    }

    if (!indexChanged) return;

    await kv.put('system_installments_index', JSON.stringify(index));

    const userIds = Object.keys(perUserTouched);
    for (const uid of userIds) {
      try {
        const raw = await kv.get(`installments_${uid}`);
        if (!raw) continue;
        let list = JSON.parse(raw);
        let changed = false;
        for (const id of perUserTouched[uid]) {
          const item = list.find(i => i.id === id);
          if (item) {
            item.lastReminderCycle = tCycle;
            changed = true;
          }
        }
        if (changed) await kv.put(`installments_${uid}`, JSON.stringify(list));
      } catch (e) {
        // خطای یک کاربر مانع پردازش بقیه نمی‌شود
      }
    }
  }
};

// ============================================================
// توابع کمکی مشترک
// ============================================================

const PERSIAN_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

// شناسه‌ی یکتا برای رکوردهای جدید اقساط - از Date.now() به‌تنهایی استفاده نمی‌شود
// چون در فراخوانی‌های پیاپی/هم‌زمان ممکن است تکراری شود و باعث خرابی ایندکس اقساط گردد
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString() + '-' + Math.random().toString(36).slice(2, 8);
}

// ذخیره فهرست کاربران برای دسترسی سریع (بدون تغییر)
async function saveUserIndex(kv, userId) {
  try {
    const raw = await kv.get('system_all_users');
    let users = raw ? JSON.parse(raw) : [];
    if (!users.includes(userId.toString())) {
      users.push(userId.toString());
      await kv.put('system_all_users', JSON.stringify(users));
    }
  } catch (e) {}
}

// ایندکس سبک اقساط همه‌ی کاربران - برای این‌که کران‌جاب مجبور نباشد رکورد هر کاربر را جداگانه بخواند
async function upsertInstallmentIndex(kv, userId, inst) {
  try {
    const raw = await kv.get('system_installments_index');
    let index = raw ? JSON.parse(raw) : [];
    const pos = index.findIndex(e => e.userId === userId.toString() && e.id === inst.id);
    const entry = {
      userId: userId.toString(),
      id: inst.id,
      title: inst.title,
      amount: inst.amount,
      dueDay: inst.dueDay,
      dueMonth: inst.dueMonth,
      recurrenceType: inst.recurrenceType,
      lastReminderCycle: inst.lastReminderCycle || null,
      lastPaidCycle: inst.lastPaidCycle || null
    };
    if (pos === -1) index.push(entry); else index[pos] = entry;
    await kv.put('system_installments_index', JSON.stringify(index));
  } catch (e) {}
}

async function removeFromInstallmentIndex(kv, userId, id) {
  try {
    const raw = await kv.get('system_installments_index');
    if (!raw) return;
    let index = JSON.parse(raw);
    index = index.filter(e => !(e.userId === userId.toString() && e.id === id));
    await kv.put('system_installments_index', JSON.stringify(index));
  } catch (e) {}
}

// کلید ماه شمسی یک تاریخ، به‌صورت "YYYY-MM" (برای نام‌گذاری کلیدهای KV تراکنش‌های ماهانه)
function monthKeyOf(date) {
  return cycleKey(toPersianDate(date));
}

// جابه‌جایی یک کلید ماه (YYYY-MM) به تعداد delta ماه (مثبت یا منفی)، با پوشش تغییر سال
function shiftMonthKey(monthKey, delta) {
  const parts = monthKey.split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) + delta;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}

// تعداد روزهای ماه شمسی‌ای که تاریخ داده‌شده در آن قرار دارد (۲۹ تا ۳۱، با پوشش سال کبیسه)
// با پیمایش روز‌به‌روز حول تاریخ ورودی محاسبه می‌شود تا نیازی به پیاده‌سازی جداگانه‌ی قانون کبیسه‌ی شمسی نباشد
function daysInPersianMonth(dateInThatMonth) {
  const target = toPersianDate(dateInThatMonth);
  // برگرد عقب تا روز اول همان ماه شمسی
  let firstOfMonth = new Date(dateInThatMonth.getTime());
  while (true) {
    const prevDay = new Date(firstOfMonth.getTime() - 86400000);
    const prevP = toPersianDate(prevDay);
    if (prevP.month !== target.month || prevP.year !== target.year) break;
    firstOfMonth = prevDay;
  }
  // از روز اول جلو بشمار تا ماه عوض شود
  let count = 0;
  let probe = firstOfMonth;
  while (true) {
    const p = toPersianDate(probe);
    if (p.month !== target.month || p.year !== target.year) break;
    count++;
    probe = new Date(probe.getTime() + 86400000);
  }
  return count;
}

// افزودن یک کلید ماه به ایندکس ماه‌های کاربر (اگر از قبل نبود)، مرتب‌شده و بدون تکرار
async function addMonthToIndex(kv, userId, monthKey) {
  const raw = await kv.get(`user_index_${userId}`);
  let months = raw ? JSON.parse(raw) : [];
  if (!months.includes(monthKey)) {
    months.push(monthKey);
    months.sort();
    await kv.put(`user_index_${userId}`, JSON.stringify(months));
  }
}

// مهاجرت یک‌باره و ایمن از کلید قدیمی تک‌آرایه‌ای (user_{userId}) به کلیدهای ماهانه.
// idempotent: اگر user_index_{userId} از قبل موجود باشد (حتی آرایه‌ی خالی)، بلافاصله برمی‌گردد
// و هیچ کاری انجام نمی‌دهد - یعنی اجرای مکرر یا نیمه‌کاره هرگز داده را تکراری یا گم نمی‌کند.
// کلید قدیمی فقط پس از موفقیت کامل نوشتن تمام کلیدهای ماهانه + ایندکس حذف می‌شود.
async function ensureMigrated(kv, userId) {
  const existingIndex = await kv.get(`user_index_${userId}`);
  if (existingIndex !== null) return; // قبلاً مهاجرت شده

  const legacyRaw = await kv.get(`user_${userId}`);
  if (!legacyRaw) {
    // شاید داده‌ی این کاربر قبلاً به کلیدهای ماهانه مهاجرت کرده اما ایندکس ثبت نشده
    // (مثلاً یک اجرای قبلی که کلید قدیمی را حذف کرده بود). قبل از نوشتن ایندکس خالی،
    // کلیدهای ماهانه‌ی موجود را پیدا و ایندکس را از روی آن‌ها بازسازی کن.
    const rebuiltMonths = await listExistingMonthKeys(kv, userId);
    await kv.put(`user_index_${userId}`, JSON.stringify(rebuiltMonths));
    return;
  }

  let legacyList;
  try {
    legacyList = JSON.parse(legacyRaw);
    if (!Array.isArray(legacyList)) legacyList = [];
  } catch (e) {
    // داده‌ی قدیمی خراب/غیرقابل‌خواندن است: کلید قدیمی را دست‌نخورده نگه می‌داریم
    // (برای بازیابی دستی بعدی) و فقط با ایندکس خالی کار برنامه را ادامه می‌دهیم.
    console.error(`ensureMigrated: corrupt legacy JSON for userId=${userId}, continuing with empty index`);
    await kv.put(`user_index_${userId}`, JSON.stringify([]));
    return;
  }

  const byMonth = {};
  for (const record of legacyList) {
    let mKey;
    try {
      const d = new Date(record && record.date);
      if (isNaN(d.getTime())) throw new Error('invalid date');
      mKey = monthKeyOf(d);
    } catch (e) {
      // تاریخ رکورد نامعتبر/غایب است: به‌جای حذف رکورد، آن را در یک سطل ثابت
      // (sentinel) نگه می‌داریم تا هیچ داده‌ای از دست نرود.
      mKey = 'unknown-date';
    }
    if (!byMonth[mKey]) byMonth[mKey] = [];
    byMonth[mKey].push(record);
  }

  const monthKeys = Object.keys(byMonth).sort();
  for (const mKey of monthKeys) {
    await kv.put(`user_${userId}_${mKey}`, JSON.stringify(byMonth[mKey]));
  }
  await kv.put(`user_index_${userId}`, JSON.stringify(monthKeys));
  // نکته: کلید قدیمی (user_{userId}) عمداً حذف نمی‌شود. حذف نکردن آن باعث می‌شود
  // اجرای هم‌زمان این تابع برای همان کاربر (که در KV بدون تراکنش/قفل رخ می‌دهد) کاملاً
  // idempotent بماند: هر اجرای هم‌زمان همان داده‌ی قدیمی را می‌خواند و همان نتیجه را
  // می‌نویسد، پس رقابت بین دو نویسنده دیگر باعث گم‌شدن داده نمی‌شود. این کلید هم‌چنین
  // به‌عنوان یک نسخه‌ی پشتیبان برای rollback احتمالی باقی می‌ماند.
  console.log(`ensureMigrated: migrated userId=${userId}, records=${legacyList.length}, months=${monthKeys.length}`);
  if (byMonth['unknown-date']) {
    console.log(`ensureMigrated: userId=${userId} has ${byMonth['unknown-date'].length} record(s) with unparsable dates, bucketed under 'unknown-date'`);
  }
}

// پیدا کردن کلیدهای ماهانه‌ی موجود یک کاربر در KV (با صفحه‌بندی) و برگرداندن نام ماه‌ها
// به‌صورت آرایه‌ی مرتب‌شده. برای بازسازی ایندکس وقتی خودِ ایندکس گم شده استفاده می‌شود.
async function listExistingMonthKeys(kv, userId) {
  const prefix = `user_${userId}_`;
  const months = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const key of page.keys) {
      months.push(key.name.slice(prefix.length));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  months.sort();
  return months;
}

function convertPersianDigits(str) {
  return String(str)
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function getPersianFormattedDate(date) {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

// استخراج سال/ماه/روز شمسی به‌صورت عددی (لاتین) برای محاسبات داخلی
function toPersianDate(date) {
  const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' });
  const parts = fmt.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day') {
      map[p.type] = parseInt(convertPersianDigits(p.value), 10);
    }
  }
  return { year: map.year, month: map.month, day: map.day };
}

function cycleKey(p) {
  return p.year + '-' + String(p.month).padStart(2, '0');
}

function toman(n) {
  return Number(n || 0).toLocaleString('fa-IR') + ' تومان';
}

function parseTransaction(rawText) {
  let text = convertPersianDigits(rawText.trim());
  text = text.replace(/(\d)[,،](\d)/g, '$1$2').replace(/(\d)[,،](\d)/g, '$1$2');

  const numMatch = text.match(/\d+(?:\.\d+)?/);
  if (!numMatch) return null;

  const amount = parseFloat(numMatch[0]);
  if (isNaN(amount) || amount <= 0) return null;

  const lower = text.toLowerCase();
  const isIncome = lower.includes('income') || lower.includes('inc') || lower.includes('in') ||
                   lower.includes('واریز') || lower.includes('درآمد') || text.startsWith('+');

  let desc = text
    .replace(numMatch[0], '')
    .replace(/^(expense|income|exp|inc|input|out|in|خرج|واریز|درآمد)/gi, '')
    .replace(/^[-:+]/, '')
    .replace(/[-:]/g, ' ')
    .trim();

  if (!desc) desc = isIncome ? 'Income' : 'Expense';

  return { type: isIncome ? 'income' : 'expense', amount, description: desc };
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendTelegramMessage(token, chatId, htmlText, webAppUrl) {
  const payload = { chat_id: chatId, text: htmlText, parse_mode: 'HTML' };
  if (webAppUrl) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: '📊 Open Dashboard', web_app: { url: webAppUrl } }]]
    };
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// گروه‌بندی روزانه‌ی یک لیست تراکنش بر اساس روز-از-ماه، به همراه سری تجمعی
// totalDays طول آرایه‌های خروجی را تعیین می‌کند (برای ماه جاری: تا امروز، برای ماه قبل: کل ماه)
function bucketDaily(records, totalDays) {
  const dailyIncome = new Array(totalDays).fill(0);
  const dailyExpense = new Array(totalDays).fill(0);
  for (const r of records) {
    const day = toPersianDate(new Date(r.date)).day;
    const idx = day - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= totalDays) continue;
    const amt = Number(r.amount) || 0;
    if (r.type === 'income') dailyIncome[idx] += amt;
    else if (r.type === 'expense') dailyExpense[idx] += amt;
  }
  const cumulativeIncome = [];
  const cumulativeExpense = [];
  let ci = 0, ce = 0;
  for (let i = 0; i < totalDays; i++) {
    ci += dailyIncome[i];
    ce += dailyExpense[i];
    cumulativeIncome.push(ci);
    cumulativeExpense.push(ce);
  }
  return { dailyIncome, dailyExpense, cumulativeIncome, cumulativeExpense };
}

// موجودی فعلی (جمع تمام تاریخچه‌ی کاربر از روی ایندکس ماهانه) + اقساط باقیمانده‌ی این ماه
// + موجودی پیش‌بینی‌شده پس از پرداخت آن‌ها
async function computeSummary(kv, userId) {
  await ensureMigrated(kv, userId);
  const rawIndex = await kv.get(`user_index_${userId}`);
  const monthKeys = rawIndex ? JSON.parse(rawIndex) : [];
  const rawInst = await kv.get(`installments_${userId}`);
  const installments = rawInst ? JSON.parse(rawInst) : [];

  let income = 0, expense = 0;
  const monthlyRaws = await Promise.all(monthKeys.map(mKey => kv.get(`user_${userId}_${mKey}`)));
  for (const raw of monthlyRaws) {
    const monthRecords = raw ? JSON.parse(raw) : [];
    for (const r of monthRecords) {
      const amt = Number(r.amount) || 0;
      if (r.type === 'income') income += amt;
      else if (r.type === 'expense') expense += amt;
    }
  }
  const balance = income - expense;

  const now = toPersianDate(new Date());
  const currentCycle = cycleKey(now);

  let pendingTotal = 0;
  const pendingList = [];
  const paidList = [];

  for (const inst of installments) {
    const isDueThisMonth = inst.recurrenceType === 'yearly' ? inst.dueMonth === now.month : true;
    if (!isDueThisMonth) continue;
    const isPaid = inst.lastPaidCycle === currentCycle;
    if (isPaid) {
      paidList.push({ id: inst.id, title: inst.title, amount: inst.amount });
    } else {
      pendingTotal += Number(inst.amount) || 0;
      pendingList.push({ id: inst.id, title: inst.title, amount: inst.amount });
    }
  }

  const projectedBalance = balance - pendingTotal;

  return {
    income,
    expense,
    balance,
    pendingTotal,
    projectedBalance,
    pendingList,
    paidList,
    currentCycle,
    currentMonthLabel: PERSIAN_MONTHS[now.month - 1],
    now
  };
}

function buildSummaryMessage(summary) {
  const { income, expense, balance, pendingTotal, projectedBalance, pendingList, currentMonthLabel } = summary;
  const statusEmoji = projectedBalance >= 0 ? '🟢' : '🔴';

  let instBlock = 'قسط باز پرداخت‌نشده‌ای برای این ماه ثبت نشده.';
  if (pendingList.length > 0) {
    instBlock = pendingList
      .map(i => '• ' + escapeHtml(i.title) + ': ' + toman(i.amount))
      .join('\n');
  }

  return (
    '📊 <b>گزارش مالی — ' + currentMonthLabel + '</b>\n\n' +
    '💰 <b>موجودی فعلی:</b> <code>$' + balance.toLocaleString('en-US') + '</code>\n' +
    '↓ <b>مجموع درآمد:</b> <code>$' + income.toLocaleString('en-US') + '</code>\n' +
    '↑ <b>مجموع هزینه:</b> <code>$' + expense.toLocaleString('en-US') + '</code>\n\n' +
    '🗓 <b>اقساط باقیمانده‌ی این ماه (' + pendingList.length + ' مورد):</b>\n' + instBlock + '\n' +
    '💵 <b>جمع اقساط باقیمانده:</b> ' + toman(pendingTotal) + '\n\n' +
    statusEmoji + ' <b>برآیند مالی پس از پرداخت اقساط:</b> <code>$' + projectedBalance.toLocaleString('en-US') + '</code>\n\n' +
    '<i>توجه: تراکنش‌ها با نماد $ و اقساط با تومان ثبت می‌شوند؛ این عدد صرفاً تفاضل عددی موجودی و جمع اقساط است.</i>'
  );
}

function renderFullMiniApp(baseUrl) {
  return '<!DOCTYPE html>' + MINI_APP_HTML.replace(/__BASE_URL__/g, baseUrl);
}

const MINI_APP_HTML = `
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Finance & Installments</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Vazirmatn:wght@400;500;600;700;800&display=swap');
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
              <div id="expense-total" class="en-font text-xs font-bold text-rose-400 mt-0.5">$0.00</div>
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
              <span id="forecast-before" class="en-font">$0.00</span>
            </div>
            <div class="h-2 rounded-full bar-track overflow-hidden">
              <div id="forecast-before-bar" class="h-full rounded-full bg-indigo-500" style="width:0%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-[10px] app-text-4 mb-1">
              <span data-i18n="balanceAfterInst">موجودی پس از اقساط</span>
              <span id="forecast-after" class="en-font">$0.00</span>
            </div>
            <div class="h-2 rounded-full bar-track overflow-hidden">
              <div id="forecast-after-bar" class="h-full rounded-full bg-violet-500" style="width:0%"></div>
            </div>
          </div>
        </div>

        <div class="flex justify-between items-center mt-3 pt-3 border-t app-border-1 text-[11px]">
          <span class="app-text-4"><span data-i18n="remainingInst">اقساط باقیمانده</span> (<span id="forecast-count">0</span> <span data-i18n="items">مورد</span>)</span>
          <span id="forecast-pending-total" class="font-bold text-amber-400">۰ تومان</span>
        </div>
      </div>

      <div class="card-glass p-5 rounded-3xl fade-in">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold app-text-3" data-i18n="budgetsTitle">🎯 بودجه‌بندی دسته‌ها</span>
          <button onclick="openBudgetModal()" class="tap text-[10px] px-2.5 py-1 rounded-full app-surface-1 app-text-3" data-i18n="editBtn">ویرایش</button>
        </div>
        <div id="budgets-container" class="space-y-0"></div>
      </div>

      <div class="card-glass p-4 rounded-3xl flex items-center gap-4 fade-in">
        <div class="w-20 h-20 relative flex-shrink-0">
          <canvas id="ratioChart"></canvas>
        </div>
        <div class="text-xs app-text-4 space-y-1">
          <div class="font-bold app-text-2 text-sm" data-i18n="flowTitle">جریان مالی</div>
          <p class="text-[11px] leading-relaxed" data-i18n="flowDesc">نسبت درآمد به هزینه‌های ثبت‌شده.</p>
        </div>
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
        <div id="inst-total" class="text-2xl font-black mt-1 text-amber-400">۰ تومان</div>
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
        <div class="text-xs font-bold app-text-4 uppercase tracking-wider mb-3" data-i18n="reportsForecastTitle">پیش‌بینی ته ماه</div>
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
            <div class="text-[10px] app-text-4" data-i18n="reportsForecastBalance">موجودی</div>
            <div id="reports-forecast-balance" class="amount-sensitive text-sm font-extrabold app-text-1 en-font mt-1">-</div>
          </div>
        </div>
        <div id="reports-vs-last-month" class="text-center text-[10px] app-text-4 mt-3"></div>
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
          <div class="flex items-start gap-2.5"><span class="text-emerald-400 mt-0.5">✓</span><span data-i18n="aboutFeature8">نمودار نسبت درآمد به هزینه و فیلتر تراکنش‌ها</span></div>
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

      <div class="text-center text-[10px] app-text-6 pb-2" data-i18n="aboutVersion">نسخه ۲.۰</div>
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
        langLabel: 'زبان', navDashboard: 'داشبورد', navInstallments: 'اقساط', navReports: 'گزارشات', navAbout: 'درباره',
        reportsTitle: 'روند درآمد و هزینه', reportsNoDataYet: 'هنوز داده‌ای برای این ماه ثبت نشده.',
        reportsChartLegendIncome: 'درآمد (این ماه)', reportsChartLegendExpense: 'هزینه (این ماه)',
        reportsChartLegendIncomePrev: 'درآمد (ماه قبل)', reportsChartLegendExpensePrev: 'هزینه (ماه قبل)',
        reportsForecastTitle: 'پیش‌بینی ته ماه', reportsForecastIncome: 'درآمد', reportsForecastExpense: 'هزینه', reportsForecastBalance: 'موجودی',
        reportsVsLastMonth: 'نسبت به ماه قبل',
        netBalance: 'موجودی خالص', totalIncome: 'مجموع درآمد', totalExpense: 'مجموع هزینه',
        incomeShort: 'درآمد', expenseShort: 'هزینه',
        streakTitle: '🔥 استریک ثبت روزانه',
        forecastTitle: '🔮 برآیند مالی این ماه', calculating: 'در حال محاسبه...',
        forecastDesc: 'موجودی شما پس از پرداخت اقساط باقیمانده‌ی همین ماه، چقدر خواهد بود.',
        currentBalance: 'موجودی فعلی', balanceAfterInst: 'موجودی پس از اقساط',
        remainingInst: 'اقساط باقیمانده', items: 'مورد',
        positiveStatus: 'وضعیت مثبت', deficitStatus: 'هشدار کسری',
        budgetsTitle: '🎯 بودجه‌بندی دسته‌ها', editBtn: 'ویرایش', noBudgets: 'هنوز سقفی تعیین نکرده‌ای.',
        flowTitle: 'جریان مالی', flowDesc: 'نسبت درآمد به هزینه‌های ثبت‌شده.',
        filterAll: 'همه', filterExpense: 'هزینه‌ها', filterIncome: 'درآمدها',
        transactionsTitle: 'تراکنش‌ها', noTransactions: 'هیچ تراکنشی ثبت نشده.',
        instTotalTitle: 'مجموع اقساط باقیمانده‌ی این ماه',
        instReminderNote: 'یادآوری خودکار یک روز قبل از سررسید در تلگرام ارسال می‌شود.',
        instListTitle: 'لیست اقساط', noInstallments: 'هیچ قسطی ثبت نشده است. روی + افزودن بزنید.',
        instNotDueThisMonth: 'این ماه سررسید ندارد', instPaidThisCycle: 'پرداخت‌شده این ماه', instPending: 'در انتظار پرداخت',
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
        aboutFeature8: 'نمودار نسبت درآمد به هزینه و فیلتر تراکنش‌ها',
        aboutMadeBy: 'طراحی و توسعه توسط', aboutVersion: 'نسخه ۲.۰',
        newTransaction: 'تراکنش جدید', editTransaction: 'ویرایش تراکنش',
        descriptionLabel: 'توضیحات', descriptionPlaceholder: 'مثال: قهوه، حقوق...',
        amountLabel: 'مبلغ', typeLabel: 'نوع', typeExpenseOpt: '🔴 هزینه', typeIncomeOpt: '🟢 درآمد',
        categoryLabel: 'دسته‌بندی (اختیاری)', categoryNone: 'بدون دسته',
        cancelBtn: 'انصراف', saveBtn: 'ذخیره',
        newInstallment: 'ثبت قسط جدید', editInstallment: 'ویرایش قسط',
        instTitleLabel: 'عنوان قسط (وام، بانک، دیجی‌پی...)', instTitlePlaceholder: 'مثال: قسط بانک رسالت',
        instAmountLabel: 'مبلغ هر قسط (تومان)',
        recurrenceLabel: 'نوع تکرار', recurrenceMonthly: 'ماهانه', recurrenceYearly: 'سالانه',
        recurrenceHint: 'ماهانه: هر ماه در همین روز سررسید دارد. سالانه: فقط در ماه مشخص‌شده هر سال.',
        instMonthLabel: 'ماه سررسید (شمسی)', instDayLabel: 'روز سررسید در ماه شمسی (۱ تا ۳۱)',
        instNotesLabel: 'توضیحات اختیاری', instNotesPlaceholder: 'شماره حساب یا توضیحات...',
        saveInstBtn: 'ذخیره قسط',
        budgetModalTitle: 'سقف بودجه‌ی ماهانه', budgetModalDesc: 'برای هر دسته یک سقف تعیین کن؛ صفر یعنی بدون سقف.',
        loadErrDash: 'خطا در بارگذاری اطلاعات.', loadErrInst: 'خطا در بارگذاری اقساط.',
        alertAmount: 'لطفاً مبلغ را وارد کنید.', confirmDeleteTx: 'این تراکنش حذف شود؟',
        alertInstFields: 'لطفاً عنوان، مبلغ و روز سررسید را وارد کنید.',
        confirmPayInst: 'این قسط پرداخت‌شده ثبت و به لیست هزینه‌ها اضافه شود؟',
        confirmDeleteInst: 'این قسط حذف شود؟'
      },
      en: {
        accountLabel: 'Account', addBtn: 'Add', themeLabel: 'Theme', themeDark: 'Dark', themeLight: 'Light',
        langLabel: 'Language', navDashboard: 'Dashboard', navInstallments: 'Installments', navReports: 'Reports', navAbout: 'About',
        reportsTitle: 'Income & Expense Trend', reportsNoDataYet: 'No data recorded yet for this month.',
        reportsChartLegendIncome: 'Income (this month)', reportsChartLegendExpense: 'Expense (this month)',
        reportsChartLegendIncomePrev: 'Income (last month)', reportsChartLegendExpensePrev: 'Expense (last month)',
        reportsForecastTitle: 'End-of-month forecast', reportsForecastIncome: 'Income', reportsForecastExpense: 'Expense', reportsForecastBalance: 'Balance',
        reportsVsLastMonth: 'vs. last month',
        netBalance: 'Net Balance', totalIncome: 'Total Income', totalExpense: 'Total Expense',
        incomeShort: 'Income', expenseShort: 'Expense',
        streakTitle: '🔥 Daily Logging Streak',
        forecastTitle: '🔮 This Month Forecast', calculating: 'Calculating...',
        forecastDesc: 'Your balance after paying the remaining installments for this month.',
        currentBalance: 'Current Balance', balanceAfterInst: 'Balance After Installments',
        remainingInst: 'Remaining Installments', items: 'items',
        positiveStatus: 'Positive', deficitStatus: 'Deficit Warning',
        budgetsTitle: '🎯 Category Budgets', editBtn: 'Edit', noBudgets: 'No budget limits set yet.',
        flowTitle: 'Financial Flow', flowDesc: 'Ratio of recorded income to expenses.',
        filterAll: 'All', filterExpense: 'Expenses', filterIncome: 'Income',
        transactionsTitle: 'Transactions', noTransactions: 'No transactions recorded.',
        instTotalTitle: 'Total Remaining Installments This Month',
        instReminderNote: 'An automatic reminder is sent on Telegram one day before each due date.',
        instListTitle: 'Installments', noInstallments: 'No installments yet. Tap + Add.',
        instNotDueThisMonth: 'Not due this month', instPaidThisCycle: 'Paid this month', instPending: 'Pending',
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
        aboutFeature8: 'Income-vs-expense chart and transaction filters',
        aboutMadeBy: 'Designed & developed by', aboutVersion: 'Version 2.0',
        newTransaction: 'New Transaction', editTransaction: 'Edit Transaction',
        descriptionLabel: 'Description', descriptionPlaceholder: 'e.g. Coffee, Salary...',
        amountLabel: 'Amount', typeLabel: 'Type', typeExpenseOpt: '🔴 Expense', typeIncomeOpt: '🟢 Income',
        categoryLabel: 'Category (optional)', categoryNone: 'No category',
        cancelBtn: 'Cancel', saveBtn: 'Save',
        newInstallment: 'New Installment', editInstallment: 'Edit Installment',
        instTitleLabel: 'Installment title (loan, bank...)', instTitlePlaceholder: 'e.g. Bank Loan',
        instAmountLabel: 'Amount per installment (Toman)',
        recurrenceLabel: 'Recurrence', recurrenceMonthly: 'Monthly', recurrenceYearly: 'Yearly',
        recurrenceHint: 'Monthly: due on this day every month. Yearly: only in the selected month, every year.',
        instMonthLabel: 'Due month (Persian calendar)', instDayLabel: 'Due day of Persian month (1-31)',
        instNotesLabel: 'Notes (optional)', instNotesPlaceholder: 'Account number or notes...',
        saveInstBtn: 'Save Installment',
        budgetModalTitle: 'Monthly Budget Limits', budgetModalDesc: 'Set a limit per category; 0 means no limit.',
        loadErrDash: 'Error loading data.', loadErrInst: 'Error loading installments.',
        alertAmount: 'Please enter an amount.', confirmDeleteTx: 'Delete this transaction?',
        alertInstFields: 'Please enter title, amount and due day.',
        confirmPayInst: 'Mark this installment as paid and add it to expenses?',
        confirmDeleteInst: 'Delete this installment?'
      }
    };

    function t(key) {
      return (I18N[currentLang] && I18N[currentLang][key]) || I18N.fa[key] || key;
    }

    // ---------- وضعیت برنامه ----------
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { tg.expand(); tg.ready(); }

    const urlParams = new URLSearchParams(window.location.search);
    let currentUserId = urlParams.get('uid') || (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id ? tg.initDataUnsafe.user.id.toString() : 'guest_user');
    const currentUserName = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || 'کاربر مالی';
    document.getElementById('user-name').textContent = currentUserName;
    document.getElementById('user-avatar').textContent = currentUserName.charAt(0).toUpperCase();

    let currentTheme = localStorage.getItem('ft_theme') || 'dark';
    let currentLang = localStorage.getItem('ft_lang') || 'fa';
    let amountsHidden = localStorage.getItem('ft_amounts_hidden') === '1';

    let activeMainTab = 'dashboard';
    let records = [];
    let previousMonthRecords = [];
    let installments = [];
    let summary = null;
    let budgetLimits = {};
    let activeFilter = 'all';
    let chartInstance = null;
    let currentRecurrence = 'monthly';

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
      localStorage.setItem('ft_theme', theme);
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
      localStorage.setItem('ft_amounts_hidden', amountsHidden ? '1' : '0');
      applyAmountVisibility();
    }

    // ---------- زبان ----------
    function applyStaticTranslations() {
      document.querySelectorAll('[data-i18n]').forEach(function(el) {
        el.textContent = t(el.getAttribute('data-i18n'));
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
      });
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
      populateMonthSelect();
      populateCategorySelect();
      if (records.length || summary) renderDashboard();
      if (installments.length) renderInstallments();
      if (activeMainTab === 'reports' && lastReportsData) renderReportsChart(lastReportsData);
    }

    function setLang(lang) {
      currentLang = lang;
      localStorage.setItem('ft_lang', lang);
      applyLanguage();
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

    const TAB_NAV_IDS = { dashboard: 'nav-dash', installments: 'nav-inst', reports: 'nav-reports', about: 'nav-about' };
    const TAB_VIEW_IDS = { dashboard: 'tab-dashboard-view', installments: 'tab-installments-view', reports: 'tab-reports-view', about: 'tab-about-view' };

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
    }

    function handleTopAddButton() {
      if (activeMainTab === 'installments') openNewInstModal();
      else if (activeMainTab === 'dashboard') openNewModal();
    }

    function refreshCurrentTab() {
      if (activeMainTab === 'dashboard') loadDashboardData();
      else if (activeMainTab === 'reports') loadReportsData();
      else loadInstallmentsData();
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

    async function loadDashboardData() {
      showSkeleton('items-container', 3);
      try {
        const prevMonthKey = persianMonthKeyOfShifted(-1);
        const results = await Promise.all([
          fetch(BASE_URL + '/api/transactions?userId=' + currentUserId),
          fetch(BASE_URL + '/api/summary?userId=' + currentUserId),
          fetch(BASE_URL + '/api/budgets?userId=' + currentUserId),
          fetch(BASE_URL + '/api/installments?userId=' + currentUserId),
          fetch(BASE_URL + '/api/transactions?userId=' + currentUserId + '&month=' + prevMonthKey)
        ]);
        records = await results[0].json();
        if (!Array.isArray(records)) records = [];
        summary = await results[1].json();
        const budgetData = await results[2].json();
        budgetLimits = (budgetData && budgetData.limits) || {};
        const instData = await results[3].json();
        installments = Array.isArray(instData) ? instData : [];
        previousMonthRecords = await results[4].json();
        if (!Array.isArray(previousMonthRecords)) previousMonthRecords = [];
        renderDashboard();
      } catch (err) {
        document.getElementById('items-container').innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'text-center text-rose-400 py-6 text-xs';
        errDiv.textContent = t('loadErrDash');
        document.getElementById('items-container').appendChild(errDiv);
      }
    }

    async function loadInstallmentsData() {
      showSkeleton('inst-container', 3);
      try {
        const res = await fetch(BASE_URL + '/api/installments?userId=' + currentUserId);
        const data = await res.json();
        installments = Array.isArray(data) ? data : [];
        renderInstallments();
      } catch (err) {
        document.getElementById('inst-container').innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'text-center text-rose-400 py-6 text-xs';
        errDiv.textContent = t('loadErrInst');
        document.getElementById('inst-container').appendChild(errDiv);
      }
    }

    function fmtUsd(n) {
      const v = Number(n) || 0;
      return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
    }

    function fmtToman(n) {
      const v = Number(n || 0);
      if (currentLang === 'fa') return v.toLocaleString('fa-IR') + ' تومان';
      return v.toLocaleString('en-US') + ' Toman';
    }

    function renderDashboard() {
      const income = (summary && summary.income) || 0;
      const expense = (summary && summary.expense) || 0;
      const balance = (summary && summary.balance) || 0;

      document.getElementById('income-total').textContent = fmtUsd(income);
      document.getElementById('expense-total').textContent = fmtUsd(expense);

      const balEl = document.getElementById('balance-total');
      balEl.textContent = fmtUsd(balance);
      balEl.className = 'en-font text-3xl font-extrabold mt-1 tracking-tight ' + (balance >= 0 ? 'text-emerald-400' : 'text-rose-400');

      renderForecast();
      renderBudgets();
      renderStreakBadges();
      updateChart(income, expense);
      renderTransactionsList();
    }

    function renderForecast() {
      if (!summary) return;
      const before = summary.balance || 0;
      const after = summary.projectedBalance || 0;
      const pendingTotal = summary.pendingTotal || 0;
      const count = (summary.pendingList && summary.pendingList.length) || 0;

      document.getElementById('forecast-before').textContent = fmtUsd(before);
      document.getElementById('forecast-after').textContent = fmtUsd(after);
      document.getElementById('forecast-count').textContent = String(count);
      document.getElementById('forecast-pending-total').textContent = fmtToman(pendingTotal);

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

    function persianMonthKeyOf(dateInput) {
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', timeZone: 'Asia/Tehran' }).formatToParts(new Date(dateInput));
      const map = {};
      parts.forEach(function(p) { if (p.type === 'year' || p.type === 'month') map[p.type] = p.value; });
      return map.year + '-' + String(map.month).padStart(2, '0');
    }

    // کلید ماه شمسی N ماه قبل/بعد از امروز (delta منفی = گذشته)، فرمت "YYYY-MM" هم‌راستا با کلیدهای بک‌اند
    // (این تابع منطق shiftMonthKey سمت بک‌اند را برای فرانت‌اند تکرار می‌کند - قالب فرانت‌اند
    // نمی‌تواند توابع بک‌اند را صدا بزند، چون در محیط اجرایی جدایی (مرورگر) اجرا می‌شود)
    function persianMonthKeyOfShifted(delta) {
      const todayParts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', timeZone: 'Asia/Tehran' }).formatToParts(new Date());
      const map = {};
      todayParts.forEach(function(p) { if (p.type === 'year' || p.type === 'month') map[p.type] = parseInt(p.value, 10); });
      let y = map.year, m = map.month + delta;
      while (m > 12) { m -= 12; y += 1; }
      while (m < 1) { m += 12; y -= 1; }
      return y + '-' + String(m).padStart(2, '0');
    }

    function computeCategorySpending() {
      const monthKey = persianMonthKeyOf(new Date());
      const spend = {};
      records.forEach(function(r) {
        if (r.type !== 'expense') return;
        if (persianMonthKeyOf(r.date) !== monthKey) return;
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
        amountSpan.className = (overLimit ? 'text-rose-400' : 'app-text-4');
        amountSpan.textContent = limit > 0 ? (fmtToman(spent) + ' / ' + fmtToman(limit)) : fmtToman(spent);
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
      await fetch(BASE_URL + '/api/budgets', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: currentUserId, limits: limits })
      });
      budgetLimits = limits;
      closeModal('budgetModal');
      renderBudgets();
    }

    function computeStreak() {
      const days = new Set();
      records.concat(previousMonthRecords).forEach(function(r) {
        days.add(new Date(r.date).toLocaleDateString('en-US-u-ca-persian'));
      });
      let cursor = new Date();
      const todayKey = cursor.toLocaleDateString('en-US-u-ca-persian');
      if (!days.has(todayKey)) {
        cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
      }
      let streak = 0;
      while (true) {
        const key = cursor.toLocaleDateString('en-US-u-ca-persian');
        if (days.has(key)) {
          streak++;
          cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
        } else break;
      }
      return streak;
    }

    function renderStreakBadges() {
      const streak = computeStreak();
      document.getElementById('streak-count').textContent = String(streak);

      const paidInstallments = installments.filter(function(i) { return !!i.lastPaidCycle; }).length;
      const stats = { totalTx: records.length, streak: streak, paidInstallments: paidInstallments };

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

    function updateChart(inc, exp) {
      const ctx = document.getElementById('ratioChart').getContext('2d');
      if (chartInstance) chartInstance.destroy();
      const hasData = (inc + exp) > 0;
      chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: [t('incomeShort'), t('expenseShort')],
          datasets: [{
            data: hasData ? [inc, exp] : [1],
            backgroundColor: hasData ? ['#10b981', '#f43f5e'] : ['#374151'],
            borderWidth: 0
          }]
        },
        options: { cutout: '75%', plugins: { legend: { display: false } } }
      });
    }

    let reportsChartInstance = null;
    let lastReportsData = null;

    async function loadReportsData() {
      try {
        const res = await fetch(BASE_URL + '/api/reports?userId=' + currentUserId);
        const data = await res.json();
        lastReportsData = data;
        renderReportsChart(data);
      } catch (err) {
        document.getElementById('reports-empty-state').classList.remove('hidden');
        document.getElementById('reports-empty-state').textContent = t('loadErrDash');
      }
    }

    function renderReportsChart(data) {
      const cur = data.currentMonth;
      const prev = data.previousMonth;
      const forecast = data.forecast;

      const hasAnyData = (cur.cumulativeIncome.some(function(v) { return v > 0; })) ||
                          (cur.cumulativeExpense.some(function(v) { return v > 0; })) ||
                          (prev.cumulativeIncome.some(function(v) { return v > 0; })) ||
                          (prev.cumulativeExpense.some(function(v) { return v > 0; }));
      document.getElementById('reports-empty-state').classList.toggle('hidden', hasAnyData);
      document.getElementById('reports-empty-state').textContent = t('reportsNoDataYet');
      document.getElementById('reports-chart-wrap').classList.toggle('hidden', !hasAnyData);

      const labels = [];
      const maxLen = Math.max(cur.totalDays, prev.totalDays);
      for (let i = 1; i <= maxLen; i++) labels.push(String(i));

      const padToLength = function(arr, len) {
        const out = arr.slice();
        while (out.length < len) out.push(null);
        return out;
      };

      const ctx = document.getElementById('reportsChart').getContext('2d');
      if (reportsChartInstance) reportsChartInstance.destroy();
      reportsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: t('reportsChartLegendIncome'),
              data: padToLength(cur.cumulativeIncome, maxLen),
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: t('reportsChartLegendExpense'),
              data: padToLength(cur.cumulativeExpense, maxLen),
              borderColor: '#f43f5e',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: t('reportsChartLegendIncomePrev'),
              data: padToLength(prev.cumulativeIncome, maxLen),
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              borderDash: [4, 4],
              borderWidth: 1,
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: t('reportsChartLegendExpensePrev'),
              data: padToLength(prev.cumulativeExpense, maxLen),
              borderColor: '#f43f5e',
              backgroundColor: 'transparent',
              borderDash: [4, 4],
              borderWidth: 1,
              tension: 0.3,
              pointRadius: 0
            }
          ]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#9ca3af', maxTicksLimit: 8 }, grid: { display: false } },
            y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(156,163,175,0.1)' } }
          },
          interaction: { intersect: false, mode: 'index' }
        }
      });

      document.getElementById('reports-forecast-income').textContent = fmtUsd(forecast.projectedIncome);
      document.getElementById('reports-forecast-expense').textContent = fmtUsd(forecast.projectedExpense);
      document.getElementById('reports-forecast-balance').textContent = fmtUsd(forecast.projectedBalance);

      const prevExpenseTotal = prev.cumulativeExpense.length ? prev.cumulativeExpense[prev.cumulativeExpense.length - 1] : 0;
      const vsLastMonthEl = document.getElementById('reports-vs-last-month');
      if (prevExpenseTotal > 0) {
        const pctChange = Math.round(((forecast.projectedExpense - prevExpenseTotal) / prevExpenseTotal) * 100);
        const sign = pctChange > 0 ? '+' : '';
        vsLastMonthEl.textContent = t('reportsVsLastMonth') + ': ' + sign + pctChange + '%';
      } else {
        vsLastMonthEl.textContent = '';
      }
    }

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
      const shamsiDate = dateObj.toLocaleDateString('fa-IR-u-ca-persian', { month: 'short', day: 'numeric' });
      const gregDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const parsed = parseCategoryFromDescription(item.description);
      const cat = getCategory(parsed.categoryId);

      const card = document.createElement('div');
      card.className = 'card-glass p-3 rounded-2xl flex items-center justify-between fade-in';

      const left = document.createElement('div');
      left.className = 'flex items-center gap-3';

      const icon = document.createElement('div');
      icon.className = 'w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm ' + (isInc ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400');
      icon.textContent = cat ? cat.icon : (isInc ? '↓' : '↑');

      const info = document.createElement('div');
      const descEl = document.createElement('div');
      descEl.className = 'font-semibold app-text-2 text-xs sm:text-sm';
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
      right.className = 'flex items-center gap-2';

      const amountEl = document.createElement('span');
      amountEl.className = 'en-font font-extrabold text-xs sm:text-sm ' + (isInc ? 'text-emerald-400' : 'text-rose-400');
      amountEl.textContent = (isInc ? '+' : '-') + '$' + Number(item.amount).toLocaleString('en-US');

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
      const countLocale = currentLang === 'fa' ? 'fa-IR' : 'en-US';
      document.getElementById('items-count').textContent = filtered.length.toLocaleString(countLocale) + ' ' + t('items');

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center app-text-5 py-8 text-xs';
        empty.textContent = t('noTransactions');
        container.appendChild(empty);
        return;
      }

      filtered.forEach(function(item) { container.appendChild(createTransactionCard(item)); });
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

      if (!amount) { alert(t('alertAmount')); return; }

      if (id) {
        const existing = records.find(function(r) { return r.id === id; });
        const monthKey = existing ? persianMonthKeyOf(existing.date) : persianMonthKeyOf(new Date());
        await fetch(BASE_URL + '/api/update', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ id: id, userId: currentUserId, month: monthKey, description: description, amount: amount, type: type })
        });
      } else {
        await fetch(BASE_URL + '/api/add', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ userId: currentUserId, description: description, amount: amount, type: type })
        });
      }

      closeModal('entryModal');
      loadDashboardData();
    }

    async function deleteItem(id) {
      if (!confirm(t('confirmDeleteTx'))) return;
      const existing = records.find(function(r) { return r.id === id; });
      const monthKey = existing ? persianMonthKeyOf(existing.date) : persianMonthKeyOf(new Date());
      await fetch(BASE_URL + '/api/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: id, userId: currentUserId, month: monthKey })
      });
      loadDashboardData();
    }

    function renderInstallments() {
      let pendingTotal = 0;
      installments.forEach(function(i) { if (i.isDueThisMonth && !i.isPaidThisCycle) pendingTotal += Number(i.amount) || 0; });
      document.getElementById('inst-total').textContent = fmtToman(pendingTotal);
      const countLocale = currentLang === 'fa' ? 'fa-IR' : 'en-US';
      document.getElementById('inst-count').textContent = installments.length.toLocaleString(countLocale) + ' ' + t('items');

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
      left.className = 'flex items-center gap-3';

      const dayBadge = document.createElement('div');
      dayBadge.className = 'w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold text-xs en-font';
      dayBadge.textContent = item.dueDay;

      const info = document.createElement('div');
      const titleEl = document.createElement('div');
      titleEl.className = 'font-semibold app-text-2 text-xs sm:text-sm';
      titleEl.textContent = item.title;

      const subRow = document.createElement('div');
      subRow.className = 'text-[10px] app-text-4 mt-0.5';
      const monthsArr = MONTHS[currentLang];
      const recurrenceLabel = item.recurrenceType === 'yearly'
        ? (t('recurrenceYearlyBadge') + ' • ' + monthsArr[(item.dueMonth || 1) - 1] + ' ' + t('dueDayWord') + ' ' + item.dueDay)
        : (t('recurrenceMonthlyBadge') + ' • ' + t('dueDayWord') + ' ' + item.dueDay + ' ' + t('everyMonthWord'));
      subRow.textContent = recurrenceLabel + (item.notes ? (' • ' + item.notes) : '');

      info.appendChild(titleEl);
      info.appendChild(subRow);
      left.appendChild(dayBadge);
      left.appendChild(info);

      const amountEl = document.createElement('div');
      amountEl.className = 'font-bold text-xs sm:text-sm text-amber-300 text-left';
      amountEl.textContent = fmtToman(item.amount);

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
      } else {
        statusBadge.className = 'text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-400';
        statusBadge.textContent = t('instPending');
      }

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2';

      const payBtn = document.createElement('button');
      payBtn.className = 'tap px-2.5 py-1 bg-emerald-600/25 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg text-[11px] font-medium transition';
      payBtn.textContent = t('payBtn');
      payBtn.onclick = function() { payInstallment(item.id); };

      const editBtn = document.createElement('button');
      editBtn.className = 'tap p-1.5 app-text-4 app-surface-hover rounded-lg text-xs';
      editBtn.textContent = '✏️';
      editBtn.onclick = function() { openEditInstModal(item.id); };

      const delBtn = document.createElement('button');
      delBtn.className = 'tap p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg text-xs';
      delBtn.textContent = '🗑';
      delBtn.onclick = function() { deleteInstallment(item.id); };

      actions.appendChild(payBtn);
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
      await fetch(BASE_URL + '/api/installments/pay', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: id, userId: currentUserId })
      });
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      loadInstallmentsData();
    }

    async function deleteInstallment(id) {
      if (!confirm(t('confirmDeleteInst'))) return;
      await fetch(BASE_URL + '/api/installments/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: id, userId: currentUserId })
      });
      loadInstallmentsData();
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

      if (id) {
        payload.id = id;
        await fetch(BASE_URL + '/api/installments/edit', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
      } else {
        await fetch(BASE_URL + '/api/installments/add', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
      }

      closeModal('instModal');
      loadInstallmentsData();
    }

    // ---------- راه‌اندازی اولیه ----------
    applyTheme();
    applyLanguage();
    applyAmountVisibility();
    loadDashboardData();
  </script>
</body>
</html>`;
