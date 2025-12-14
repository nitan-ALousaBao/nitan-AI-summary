// ==UserScript==
// @name         USCardForum AI 总结 (v38.0 状态文案精修版)
// @namespace    http://tampermonkey.net/
// @version      38.0
// @description  修复状态提示文案，区分系统初始化与任务执行状态
// @author       You
// @match        https://www.uscardforum.com/*
// @connect      generativelanguage.googleapis.com
// @connect      uscardforum.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // ✅ 你的 API Key
    const API_KEY = ;

    // 🎨 样式
    GM_addStyle(`
        .ai-progress-container { width: 100%; height: 6px; background: #e9ecef; margin-top: 10px; border-radius: 3px; overflow: hidden; display: none; }
        .ai-progress-bar { width: 0%; height: 100%; background: #28a745; transition: width 0.2s ease; }
        .ai-btn-group { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
        .ai-btn { padding: 8px 16px; color: white; border: 1px solid rgba(255,255,255,0.5); border-radius: 50px; cursor: pointer; font-weight: bold; font-size: 13px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transition: transform 0.1s; min-width: 140px; font-family: sans-serif; }
        .ai-btn:hover { transform: scale(1.05); }
        .ai-btn:active { transform: scale(0.95); }
        .tag-green { border:1px solid #28a745; color:#28a745; }
        .tag-yellow { border:1px solid #ffc107; color:#856404; }
        .tag-red { border:1px solid #dc3545; color:#dc3545; }
        .tag-blue { border:1px solid #17a2b8; color:#17a2b8; }
        .tag-purple { border:1px solid #6f42c1; color:#6f42c1; }
    `);

    // 📚 配额元数据
    const MODEL_META = {
        'gemini-1.5-flash':      { type: 'rec',    limit: 'high' },
        'gemini-1.5-flash-001':  { type: 'stable', limit: 'high' },
        'gemini-1.5-flash-002':  { type: 'new',    limit: 'high' },
        'gemini-1.5-flash-8b':   { type: 'fast',   limit: 'high' },
        'gemini-1.5-pro':        { type: 'smart',  limit: 'mid' },
        'gemini-1.5-pro-001':    { type: 'stable', limit: 'mid' },
        'gemini-1.5-pro-002':    { type: 'new',    limit: 'mid' },
        'gemini-2.5-flash':      { type: 'low',    limit: 'tiny' },
        'gemini-2.0-flash-exp':  { type: 'exp',    limit: 'low' },
        'gemma-3-1b-it':         { type: 'small',  limit: 'mid' },
    };

    const CONTAINER_ID = 'ai-btn-container-v38';
    const BOX_ID = 'ai-result-box-v38';
    const SETTINGS_ID = 'ai-settings-v38';

    // 状态
    let currentModel = GM_getValue('ai_model_selection', null);
    let availableModels = [];
    let currentLang = localStorage.getItem('ai_summary_lang') || 'zh';
    let currentMode = null;

    // === 🌐 语言包定义 ===
    const I18N = {
        zh: {
            // 按钮
            btn_search_ultra: "🤯 究极搜索 (并发快)",
            btn_search_deep: "🧠 深度搜索 (Top 50 标题)",
            btn_search_fast: "⚡ 屏幕总结",
            btn_topic_full: "🧠 深度全帖 (并发快)",
            btn_topic_medium: "⚖️ 中度分析 (首尾)",
            btn_topic_fast: "⚡ 快速总结",
            btn_settings: "⚙️ 模型设置",
            btn_close: "关闭",
            // UI文本
            ui_title: "🤖 AI 总结报告",
            lang_zh: "🇨🇳 中文",
            lang_en: "🇺🇸 English",
            model_loading: "🔄 系统初始化...",  // 修正1：系统加载状态
            model_label: "当前: ",
            settings_title: "⚙️ 选择 AI 模型",
            settings_desc: "列表由您的 API Key 实时获取。",
            settings_fetching: "⏳ 正在从 Google 获取列表...",
            settings_note: "注意：红色标签模型通常每日仅限 20 次。",
            // 状态提示
            status_start: "🚀 任务启动中...", // 修正2：点击按钮后的第一状态
            status_fetching_meta: "⏳ 正在获取帖子元数据...",
            status_fetching_list: "⏳ 正在获取列表...",
            status_reading: "📥 正在并发抓取: ",
            status_analyzing: "🤖 抓取完成，AI 正在深度思考...",
            // 错误
            err_no_result: "❌ 没有搜索结果",
            err_too_long: "⚠️ 帖子过长 (>3000楼)，是否继续？",
            err_fail: "❌ 失败: ",
            err_net: "网络错误",
            // Prompt 指令
            prompt_lang: "【重要】：请严格使用简体中文输出。",
            prompt_search_ultra: "你是一个专家。综合这10个帖子的内容生成终极指南：1.最佳方案 2.观点冲突 3.演变历史 4.雷区汇总。",
            prompt_topic_full: "这是帖子的【全部楼层】。请利用长窗口能力深度分析：1.时间线梳理 2.最终定论 3.DP汇总 4.风险警告。",
            prompt_screen: "请总结当前屏幕上的内容。",
            prompt_titles: "请根据这些标题生成趋势简报。",
            prompt_medium: "这是帖子的首尾内容，请总结：意图、现状、DP、风险。",
            // 标签翻译
            tag_rec: "🟢 推荐", tag_stable: "🟢 稳定", tag_new: "🟢 最新", tag_fast: "🟢 极速",
            tag_smart: "🟡 聪明", tag_stable_y: "🟡 稳定",
            tag_low: "🔴 极低", tag_exp: "🔴 实验", tag_future: "🔴 预览", tag_img: "🔴 图像",
            tag_small: "🔵 小模型", tag_mid: "🔵 中模型", tag_large: "🔵 大模型",
            tag_unknown: "❓ 未知",
            limit_high: "1500/天", limit_mid: "50/天", limit_low: "低", limit_tiny: "20/天", limit_unk: "未知"
        },
        en: {
            btn_search_ultra: "🤯 Ultra Search (Fast)",
            btn_search_deep: "🧠 Deep Search (Top 50)",
            btn_search_fast: "⚡ Screen Summary",
            btn_topic_full: "🧠 Deep Full-Topic (Fast)",
            btn_topic_medium: "⚖️ Medium Analysis",
            btn_topic_fast: "⚡ Fast Summary",
            btn_settings: "⚙️ Settings",
            btn_close: "Close",
            ui_title: "🤖 AI Summary",
            lang_zh: "🇨🇳 Chinese",
            lang_en: "🇺🇸 English",
            model_loading: "🔄 System Init...",
            model_label: "Model: ",
            settings_title: "⚙️ Select Model",
            settings_desc: "List fetched via your API Key.",
            settings_fetching: "⏳ Fetching list...",
            settings_note: "Note: Red tags often have a 20/day limit.",
            status_start: "🚀 Starting...",
            status_fetching_meta: "⏳ Fetching Metadata...",
            status_fetching_list: "⏳ Fetching List...",
            status_reading: "📥 Reading: ",
            status_analyzing: "🤖 Data fetched. Analyzing...",
            err_no_result: "❌ No results",
            err_too_long: "⚠️ Too long (>3000 posts). Continue?",
            err_fail: "❌ Failed: ",
            err_net: "Network Error",
            prompt_lang: "【IMPORTANT】：Please output strictly in ENGLISH.",
            prompt_search_ultra: "Generate an Ultimate Guide based on these 10 threads: 1. Solution 2. Conflicts 3. History 4. Risks.",
            prompt_topic_full: "Analyze FULL topic: 1. Timeline 2. Conclusion 3. DPs 4. Risks.",
            prompt_screen: "Summarize screen content.",
            prompt_titles: "Generate trend report from titles.",
            prompt_medium: "Summarize start and end: Intent, Status, DPs, Risks.",
            tag_rec: "🟢 Rec.", tag_stable: "🟢 Stable", tag_new: "🟢 New", tag_fast: "🟢 Fast",
            tag_smart: "🟡 Smart", tag_stable_y: "🟡 Stable",
            tag_low: "🔴 Low", tag_exp: "🔴 Exp.", tag_future: "🔴 Preview", tag_img: "🔴 Image",
            tag_small: "🔵 Small", tag_mid: "🔵 Medium", tag_large: "🔵 Large",
            tag_unknown: "❓ Unk.",
            limit_high: "1500/d", limit_mid: "50/d", limit_low: "Low", limit_tiny: "20/d", limit_unk: "Unk."
        }
    };
    const t = (key) => I18N[currentLang][key] || key;

    // === 1. 初始化 ===
    initModelList();

    async function initModelList() {
        try {
            availableModels = await fetchModelListFromAPI();
            if (!currentModel || !availableModels.includes(currentModel)) {
                currentModel = autoPickBestModel(availableModels);
                GM_setValue('ai_model_selection', currentModel);
            }
            updateMainUI();
        } catch (e) { console.error(e); }
    }

    // === 2. 界面监控 ===
    setInterval(() => {
        const url = window.location.href;
        const valid = (url.includes('/search') && document.querySelector('.fps-result')) ||
                      (url.includes('/t/') && document.querySelector('.post-stream'));
        if (valid) {
            if (!document.getElementById(CONTAINER_ID)) createMainUI();
            let newMode = url.includes('/search') ? 'search' : 'topic';
            if (currentMode !== newMode) { currentMode = newMode; updateMainUI(); }
        } else {
            const c = document.getElementById(CONTAINER_ID);
            if(c) c.remove();
        }
    }, 1000);

    // === 3. API & 逻辑 ===
    function fetchModelListFromAPI() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`,
                onload: (res) => {
                    if (res.status === 200) {
                        const json = JSON.parse(res.responseText);
                        resolve((json.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent")).map(m => m.name.replace('models/', '')));
                    } else reject(res.status);
                },
                onerror: () => reject("NetErr")
            });
        });
    }

    function autoPickBestModel(list) {
        const prefs = ['gemini-1.5-flash-002', 'gemini-1.5-flash-001', 'gemini-1.5-flash', 'gemini-1.5-pro-002'];
        for (let p of prefs) if (list.includes(p)) return p;
        const flash = list.find(m => m.includes('flash') && !m.includes('2.5') && !m.includes('exp'));
        return flash || list[0];
    }

    // === 4. UI 构建 ===
    function createMainUI() {
        if(document.getElementById(CONTAINER_ID)) return;
        const c = document.createElement('div');
        c.id = CONTAINER_ID;
        c.className = 'ai-btn-group';
        c.style.cssText = `position: fixed !important; bottom: 40px; right: 40px; z-index: 999999;`;

        const toolbar = document.createElement('div');
        toolbar.style.cssText = "display:flex; gap:5px;";

        const langSel = document.createElement('select');
        langSel.style.cssText = "padding:4px;border-radius:8px;font-size:12px;border:1px solid #ccc;cursor:pointer;";
        langSel.innerHTML = `<option value="zh" ${currentLang==='zh'?'selected':''}>${I18N.zh.lang_zh}</option><option value="en" ${currentLang==='en'?'selected':''}>${I18N.en.lang_en}</option>`;
        langSel.onchange = (e) => { currentLang = e.target.value; localStorage.setItem('ai_summary_lang', currentLang); updateMainUI(); };

        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = t('btn_settings');
        settingsBtn.style.cssText = "padding:4px 8px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid #ccc;background:#f8f9fa;";
        settingsBtn.onclick = showSettings;

        toolbar.appendChild(langSel);
        toolbar.appendChild(settingsBtn);
        c.appendChild(toolbar);

        const isSearch = window.location.href.includes('/search');
        if (isSearch) {
            c.appendChild(createBtn(t('btn_search_ultra'), '#dc3545', handleSearchUltra));
            c.appendChild(createBtn(t('btn_search_deep'), '#6f42c1', handleSearchDeep));
            c.appendChild(createBtn(t('btn_search_fast'), '#0088cc', handleSearchFast));
        } else {
            c.appendChild(createBtn(t('btn_topic_full'), '#dc3545', handleTopicFull));
            c.appendChild(createBtn(t('btn_topic_medium'), '#6f42c1', handleTopicMedium));
            c.appendChild(createBtn(t('btn_topic_fast'), '#fd7e14', handleTopicFast));
        }

        const lbl = document.createElement('div');
        lbl.style.cssText = "font-size:10px; color:#666; background:rgba(255,255,255,0.8); padding:2px 5px; border-radius:4px;";
        // 修正：这里不再硬编码 "Initializing..."，而是使用 "model_loading" (🔄 系统初始化...)
        lbl.innerText = currentModel ? `${t('model_label')} ${currentModel}` : t('model_loading');
        c.appendChild(lbl);

        document.body.appendChild(c);
    }

    function createBtn(text, color, onClick) {
        const b = document.createElement('button');
        b.className = 'ai-btn';
        b.innerHTML = text;
        b.style.background = color;
        b.onclick = onClick;
        return b;
    }

    function updateMainUI() {
        const old = document.getElementById(CONTAINER_ID);
        if(old) old.remove();
        createMainUI();
    }

    // === 5. 设置面板 ===
    function showSettings() {
        if(document.getElementById(SETTINGS_ID)) return;
        const box = document.createElement('div');
        box.id = SETTINGS_ID;
        box.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:450px;max-height:80vh;background:white;z-index:1000001;padding:20px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid #ccc;display:flex;flex-direction:column;`;
        box.innerHTML = `<h3>${t('settings_title')}</h3><p style="font-size:11px;color:#d63384;">${t('settings_note')}</p>`;

        const list = document.createElement('div');
        list.style.cssText = "overflow-y:auto;flex-grow:1;margin:10px 0;border:1px solid #eee;border-radius:8px;";

        if(availableModels.length === 0) {
            list.innerHTML = `<div style="padding:20px;text-align:center;">${t('settings_fetching')}</div>`;
            initModelList().then(() => { box.remove(); showSettings(); });
        } else {
            availableModels.forEach(m => {
                const info = getModelDisplayInfo(m);
                const isSel = m === currentModel;
                const item = document.createElement('div');
                item.style.cssText = `padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:${isSel?'#e3f2fd':'white'};`;
                item.innerHTML = `
                    <div>
                        <div style="font-weight:bold;color:#333;">${m}</div>
                        <div style="font-size:11px;margin-top:2px;">
                            <span style="padding:1px 4px;border-radius:4px;margin-right:5px;font-size:10px;" class="${info.class}">${info.tagName}</span>
                            <span style="color:#666;">Limit: ${info.limitName}</span>
                        </div>
                    </div>
                    <div>${isSel ? '✅' : ''}</div>
                `;
                item.onclick = () => { currentModel = m; GM_setValue('ai_model_selection', m); updateMainUI(); box.remove(); };
                list.appendChild(item);
            });
        }
        box.appendChild(list);

        const close = document.createElement('button');
        close.innerText = t('btn_close');
        close.style.cssText = "padding:8px;cursor:pointer;border:1px solid #ddd;background:#f8f9fa;border-radius:5px;";
        close.onclick = () => box.remove();
        box.appendChild(close);
        document.body.appendChild(box);
    }

    function getModelDisplayInfo(modelName) {
        let meta = MODEL_META[modelName];
        if (!meta) {
            if (modelName.includes('2.5') || modelName.includes('exp')) meta = { type: 'low', limit: 'tiny' };
            else if (modelName.includes('gemma')) meta = { type: 'small', limit: 'mid' };
            else if (modelName.includes('pro')) meta = { type: 'smart', limit: 'mid' };
            else meta = { type: 'unknown', limit: 'unk' };
        }
        let cssClass = 'tag-yellow';
        if (['rec', 'stable', 'new', 'fast'].includes(meta.type)) cssClass = 'tag-green';
        else if (['low', 'exp', 'future', 'img'].includes(meta.type)) cssClass = 'tag-red';
        else if (['small', 'mid', 'large'].includes(meta.type)) cssClass = 'tag-blue';
        else if (meta.type.includes('purple')) cssClass = 'tag-purple';

        return {
            class: cssClass,
            tagName: t('tag_' + meta.type) || meta.type,
            limitName: t('limit_' + meta.limit) || meta.limit
        };
    }

    // ============================================================
    // 🚀 业务逻辑
    // ============================================================

    async function fetchBatchedParallel(topicId, postIds) {
        const BATCH_SIZE = 50;
        const chunks = [];
        for(let i=0; i<postIds.length; i+=BATCH_SIZE) chunks.push(postIds.slice(i,i+BATCH_SIZE));

        const total = chunks.length;
        let completed = 0;
        updateProgressBar(0);

        const promises = chunks.map(chunkIds => {
            const q = chunkIds.map(id => `post_ids[]=${id}`).join('&');
            return fetchJson(`https://www.uscardforum.com/t/${topicId}/posts.json?include_raw=true&${q}`)
                .then(res => {
                    completed++;
                    updateProgressBar((completed / total) * 100);
                    let txt = "";
                    res.post_stream.posts.forEach(p => txt += `[${p.username}]: ${p.raw||p.cooked.replace(/<[^>]+>/g,'')}\n---\n`);
                    return txt;
                })
                .catch(() => "");
        });
        const results = await Promise.all(promises);
        return results.join("");
    }

    async function handleTopicFull() {
        // 修正：使用 status_start，不使用 model_loading
        showResult(t('status_start'), true);

        updateProgressBoxText(t('status_fetching_meta'));
        const meta = await fetchJson(window.location.href.split('?')[0] + ".json");
        const total = meta.post_stream.stream.length;
        if(total > 3000 && !confirm(t('err_too_long'))) return;

        showProgressUI();
        const content = await fetchBatchedParallel(meta.id, meta.post_stream.stream);
        callAI(`${t('prompt_topic_full')}\nData:\n${content}`, "Full Topic");
    }

    async function handleSearchUltra() {
        showResult(t('status_start'), true);
        try {
            const q = new URLSearchParams(window.location.search).get('q');
            const sData = await fetchJson(`https://www.uscardforum.com/search/query.json?term=${encodeURIComponent(q)}`);
            const topics = (sData.topics || []).slice(0, 10);
            showProgressUI();
            let combined = `Query: ${q}\n\n`;
            for (let i = 0; i < topics.length; i++) {
                const t = topics[i];
                updateProgressBoxText(`${t('status_reading')} [${i+1}/10] ${t.title}`);
                updateProgressBar(((i)/10)*100);
                try {
                    const meta = await fetchJson(`https://www.uscardforum.com/t/${t.id}.json`);
                    const ids = meta.post_stream.stream;
                    const target = ids.length <= 80 ? ids : [...new Set([...ids.slice(0, 40), ...ids.slice(ids.length - 40, ids.length)])];
                    const content = await fetchBatchedParallel(t.id, target);
                    combined += `\n=== Thread ${i+1}: ${t.title} ===\n${content}\n`;
                } catch (e) {}
            }
            updateProgressBar(100);
            callAI(`${t('prompt_search_ultra')}\n${combined}`, "Ultra Search");
        } catch (e) { showResult(t('err_fail') + e.message); }
    }

    async function handleTopicMedium() {
        showResult(t('status_start'), true);
        const meta = await fetchJson(window.location.href.split('?')[0] + ".json");
        const ids = meta.post_stream.stream;
        const target = ids.length <= 60 ? ids : [...new Set([...ids.slice(0, 30), ...ids.slice(ids.length - 30, ids.length)])];
        showProgressUI();
        const content = await fetchBatchedParallel(meta.id, target);
        callAI(`${t('prompt_medium')}\nData:\n${content}`, "Medium Analysis");
    }
    function handleTopicFast() {
        const posts = document.querySelectorAll('.topic-post');
        let txt = ""; posts.forEach((p,i) => { if(i<40) txt += `[${p.querySelector('.username')?.innerText}]: ${p.querySelector('.cooked')?.innerText.substring(0,200)}\n` });
        callAI(`${t('prompt_screen')}\nData:\n${txt}`, "Screen");
    }
    function handleSearchFast() {
        const list = document.querySelectorAll('.fps-result');
        let txt = ""; list.forEach((l,i) => { if(i<20) txt += `${i+1}. ${l.innerText.replace(/\n/g,' ')}\n` });
        callAI(`${t('prompt_screen')}\nData:\n${txt}`, "Screen");
    }
    async function handleSearchDeep() {
        showResult(t('status_start'), true);
        const q = new URLSearchParams(window.location.search).get('q');
        const data = await fetchJson(`https://www.uscardforum.com/search/query.json?term=${encodeURIComponent(q)}`);
        let txt = `Query: ${q}\n\n`;
        data.topics.slice(0,50).forEach((t,i) => txt += `${i+1}. [${t.title}] (Replies:${t.posts_count})\n`);
        callAI(`${t('prompt_titles')}\nData:\n${txt}`, "Deep Search");
    }

    // === Tools & UI ===
    async function fetchJson(url) { return new Promise((res, rej) => GM_xmlhttpRequest({ method: "GET", url, onload: r => r.status==200?res(JSON.parse(r.responseText)):rej(new Error(r.status)), onerror: rej })); }

    function callAI(content, type) {
        if(!currentModel) { alert("Model Init Failed"); return; }
        updateProgressBoxText(t('status_analyzing'));
        const langInfo = t('prompt_lang');
        GM_xmlhttpRequest({
            method: "POST",
            url: `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${API_KEY}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ contents: [{ parts: [{ text: `${langInfo}\nTask: ${type}\nData:\n${content}` }] }] }),
            onload: (res) => {
                if(res.status===200) {
                    try { showResult(JSON.parse(res.responseText).candidates[0].content.parts[0].text); }
                    catch(e) { showResult("Parse Error"); }
                } else if (res.status===429) {
                    showResult(`❌ 429 Limit Exceeded (${currentModel}).`);
                } else {
                    showResult(`Error ${res.status}: ${res.responseText}`);
                }
            },
            onerror: () => showResult("Network Error")
        });
    }

    function showResult(text, loading = false) {
        let box = document.getElementById(BOX_ID);
        if (!box) {
            box = document.createElement('div');
            box.id = BOX_ID;
            box.style.cssText = `position: fixed; top: 10%; right: 10%; width: 550px; height: 75vh; background: white; z-index: 1000000; border-radius: 12px; box-shadow: 0 25px 80px rgba(0,0,0,0.5); font-family: sans-serif; border: 1px solid #ccc; display: flex; flex-direction: column;`;
            const header = document.createElement('div');
            header.style.cssText = `padding:12px 20px;border-bottom:1px solid #eee;background:#f8f9fa;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;`;
            header.innerHTML = `<b>${t('ui_title')}</b>`;
            const close = document.createElement('button');
            close.innerText = "✕";
            close.style.cssText = "border:none;background:none;font-size:18px;cursor:pointer;";
            close.onclick = () => box.style.display = 'none';
            header.appendChild(close);
            box.appendChild(header);
            const prog = document.createElement('div');
            prog.id = BOX_ID + '_prog';
            prog.style.cssText = "padding:0 20px; display:none;";
            prog.innerHTML = `<div class="ai-progress-container"><div class="ai-progress-bar"></div></div><div id="${BOX_ID}_prog_text" style="font-size:12px;color:#666;text-align:center;margin-top:5px;"></div>`;
            box.appendChild(prog);
            const content = document.createElement('div');
            content.id = BOX_ID + '_content';
            content.style.cssText = `padding:20px;overflow-y:auto;flex-grow:1;line-height:1.6;font-size:14px;color:#333;`;
            box.appendChild(content);
            document.body.appendChild(box);
        }

        box.querySelector('b').innerText = t('ui_title');
        box.style.display = 'flex';

        const progBox = document.getElementById(BOX_ID + '_prog');
        if(!loading && progBox) progBox.style.display = 'none';
        const c = document.getElementById(BOX_ID + '_content');
        if(loading) c.innerHTML = `<div style="text-align:center;margin-top:50px;color:#0088cc;">${text}</div>`;
        else c.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    }

    function showProgressUI() {
        const progBox = document.getElementById(BOX_ID + '_prog');
        if(progBox) { progBox.style.display = 'block'; progBox.querySelector('.ai-progress-bar').style.width = '0%'; }
    }
    function updateProgressBar(percent) { const bar = document.querySelector('.ai-progress-bar'); if(bar) bar.style.width = `${percent}%`; }
    function updateProgressBoxText(txt) { const tDiv = document.getElementById(BOX_ID + '_prog_text'); if(tDiv) tDiv.innerText = txt; }


})();
