let CLIENT_ID;
let API_KEY;
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient;
let gapiInited = false;
let gisInited = false;

// 캐릭터 정보
const characters = {
    "아서": { id: "Arthur_s", path: "/json/origin/arthur.json" },
    "샬럿": { id: "zZzzZzz", path: "/json/origin/charlotte.json" },
    "위스테라이": { id: "Nightmare", path: "/json/origin/wiz.json" },
    "딜런": { id: "DylanRossini", path: "/json/origin/dylan.json" },
    "리키": { id: "RICKYBANG", path: "/json/origin/ricky.json" },
    "윈터": { id: "Winter", path: "/json/origin/winter.json" },
    "제이어드": { id: "DD_Jayard", path: "/json/origin/j.json" },
    "루": { id: "LuBu3", path: "/json/origin/lu.json" },
    "엘가": { id: "Elgar", path: "/json/origin/elgar.json" },
    "할로우": { id: "H0110W", path: "/json/origin/hollow.json" },
    "도로테아": { id: "Dorothy_Witch", path: "/json/origin/dorothy.json" },
    "케일럽": { id: "Y0UNGBL00D", path: "/json/origin/cale.json" },
    "멜리사": { id: "Melissa", path: "/json/origin/melissa.json" },
    "카이퍼": { id: "Ebony", path: "/json/origin/kuiper.json" },
    "타우리온": { id: "TauLeo", path: "/json/origin/tauleon.json" },
    "요세프": { id: "Y0S3F", path: "/json/origin/yosef.json" },
};

// id → 한글 이름 매핑
const idToName = {};
Object.entries(characters).forEach(([name, obj]) => {
    idToName[obj.id] = name;
});

// HTML 태그 제거 및 @멘션 분리
function cleanText(htmlString) {
    if (!htmlString) return { target: "", content: "" };

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const text = doc.body.textContent || "";

    let target = "";
    let content = text;
    const match = text.match(/^(@\S+)\s*(.*)/);
    if (match) {
        target = match[1];  // @abc
        content = match[2]; // hi
    }

    return { target, content };
}

// DM 체크
function isDM(noteObj) {
    const dmTargets = [
        "https://paradise-is-not-lost.whippy.kr/users/NOTICE",
        "https://paradise-is-not-lost.whippy.kr/users/Paradise",
        "https://paradise-is-not-lost.whippy.kr/users/SYSTEM"
    ];
    let toList = noteObj.to || [];
    if (typeof toList === "string") toList = [toList];
    return toList.some(t => dmTargets.includes(t));
}

// JSON 로드
async function loadSelectedJsonFiles(selectedNames) {
    const allMessages = [];
    for (let name of selectedNames) {
        const char = characters[name];
        if (!char) continue;
        try {
            const res = await fetch(char.path);
            if (!res.ok) continue;
            const data = await res.json();
            (data.orderedItems || []).forEach(item => {
                if (item.object && item.object.type === "Note" && !isDM(item.object)) {
                    allMessages.push(item.object);
                }
            });
        } catch (e) { console.error(e); }
    }
    return allMessages;
}

// 스레드 수집
function collectThreads(messages) {
    const idMap = {};
    const repliesTo = {};
    messages.forEach(msg => {
        idMap[msg.id] = msg;
        if (msg.inReplyTo) {
            if (!repliesTo[msg.inReplyTo]) repliesTo[msg.inReplyTo] = [];
            repliesTo[msg.inReplyTo].push(msg);
        }
    });

    function dfs(id, visited = new Set()) {
        if (visited.has(id)) return [];
        visited.add(id);
        const msg = idMap[id];
        if (!msg) return [];
        let thread = [msg];
        (repliesTo[id] || []).forEach(reply => {
            thread = thread.concat(dfs(reply.id, visited));
        });
        return thread;
    }

    const rootIds = messages.filter(m => !m.inReplyTo).map(m => m.id);
    const threads = [];
    rootIds.forEach(rootId => {
        const thread = dfs(rootId);
        if (thread.length > 1) threads.push(thread);
    });
    return threads;
}

// Google API 초기화
async function initApp() {
    try {
        const res = await fetch("./config.json");
        const config = await res.json();
        CLIENT_ID = config.CLIENT_ID;
        API_KEY = config.API_KEY;

        await new Promise(resolve => {
            gapi.load('client', async () => {
                await gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"]
                });
                gapiInited = true;
                resolve();
            });
        });

        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                console.log("로그인 완료", tokenResponse);
                document.getElementById("uploadBtn").disabled = false;
            }
        });
        gisInited = true;
    } catch (err) {
        console.error(err);
        alert("Google API 초기화 실패!");
    }
}

// 캐릭터 체크박스 생성
function generateCharacterCheckboxes() {
    const container = document.getElementById("characterList");
    Object.keys(characters).forEach(name => {
        const label = document.createElement("label");
        label.style.marginRight = "10px";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = name;
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + name));
        container.appendChild(label);
    });
}

// 한국 시간 변환
function toKST(utc) {
    const d = new Date(utc);
    const kst = new Date(d.getTime() + 9*60*60*1000);
    return kst.toISOString().replace("T", " ").substring(0, 19);
}

// 로그인 버튼
document.getElementById("authBtn").addEventListener("click", () => {
    if (!gapiInited || !gisInited) {
        alert("Google API 초기화가 아직 안 됐습니다.");
        return;
    }
    tokenClient.requestAccessToken({ prompt: 'consent' });
});

// 업로드 버튼
document.getElementById("uploadBtn").addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll("#characterList input:checked")).map(i => i.value);
    if (!selected.length) return alert("캐릭터를 선택하세요!");

    const sheetName = document.getElementById("sheetName").value || "역극백업";
    const allMessages = await loadSelectedJsonFiles(selected);
    const threads = collectThreads(allMessages);

    const records = [["날짜","카테고리","작성자","내용"]]; // 대상 열 제거
    let category = 1;
    threads.forEach(thread => {
        thread.sort((a,b) => new Date(a.published)-new Date(b.published)).forEach(msg => {
            const textObj = cleanText(msg.contentMap?.ko || msg.content || "");
            records.push([
                toKST(msg.published),
                category,
                idToName[msg.attributedTo?.split("/").pop()] || msg.attributedTo?.split("/").pop(),
                textObj.content
            ]);
        });
        category++;
    });

    const response = await gapi.client.sheets.spreadsheets.create({
        properties: { title: sheetName }
    });
    const spreadsheetId = response.result.spreadsheetId;

    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "A1",
        valueInputOption: "RAW",
        resource: { values: records }
    });

    const url = "https://docs.google.com/spreadsheets/d/" + spreadsheetId;
    navigator.clipboard.writeText(url).then(() => {
        alert("시트 생성 완료! 링크가 클립보드에 복사되었습니다.");
    });
});

// 초기화
window.addEventListener("DOMContentLoaded", () => {
    generateCharacterCheckboxes();
    initApp();
});