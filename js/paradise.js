let CLIENT_ID, API_KEY;
// Google Sheets + Google Drive Readonly 권한 모두 요청
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly";

let tokenClient, gapiInited = false, gisInited = false;
let accessToken = null;

// 캐릭터 정보
const characters = {
    "아서": { id: "Arthur_s", fileName: "arthur.json", enabled: true },
    "샬럿": { id: "zZzzZzz", fileName: "charlotte.json", enabled: true },
    "니나": { id: "NINA", fileName: "nina.json", enabled: false },
    "위스테라이": { id: "Nightmare", fileName: "wiz.json", enabled: false },
    "딜런": { id: "DylanRossini", fileName: "dylan.json", enabled: false },
    "리키": { id: "RICKYBANG", fileName: "ricky.json", enabled: false },
    "윈터": { id: "Winter", fileName: "winter.json", enabled: false },
    "제이어드": { id: "DD_Jayard", fileName: "j.json", enabled: true },
    "루": { id: "LuBu3", fileName: "lu.json", enabled: true },
    "엘가": { id: "Elgar", fileName: "elgar.json", enabled: true },
    "할로우": { id: "H0110W", fileName: "hollow.json", enabled: false },
    "도로테아": { id: "Dorothy_Witch", fileName: "dorothy.json", enabled: false },
    "케일럽": { id: "Y0UNGBL00D", fileName: "cale.json", enabled: false },
    "멜리사": { id: "Melissa", fileName: "melissa.json", enabled: true },
    "카이퍼": { id: "Ebony", fileName: "kuiper.json", enabled: false },
    "타우리온": { id: "TauLeo", fileName: "tauleon.json", enabled: false },
    "요세프": { id: "Y0S3F", fileName: "yosef.json", enabled: true },
};

// id → 한글 이름 매핑
const idToName = {};
Object.entries(characters).forEach(([name, obj]) => idToName[obj.id] = name);

// JSON에서 HTML 제거 및 @멘션 분리
function cleanText(htmlString) {
    if (!htmlString) return { target: "", content: "" };
    const parser = new DOMParser();
    const text = parser.parseFromString(htmlString, "text/html").body.textContent || "";
    const match = text.match(/^(@\S+)\s*(.*)/);
    return match ? { target: match[1], content: match[2] } : { target: "", content: text };
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

async function fetchJsonFromDrive(fileName) {
    const fileId = driveFiles[fileName];
    if (!fileId) throw new Error(`${fileName}에 대한 Drive 파일 ID가 config에 없습니다.`);
    if (!accessToken) throw new Error("OAuth2 로그인 후 사용 가능합니다.");

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`${fileName} 다운로드 실패: ${res.status}`);
    return await res.json();
}

// 선택된 캐릭터 JSON 로드
async function loadSelectedJsonFiles(selectedNames) {
    const allMessages = [];
    for (let name of selectedNames) {
        const char = characters[name];
        if (!char) continue;
        try {
            const data = await fetchJsonFromDrive(char.fileName);
            (data.orderedItems || []).forEach(item => {
                if (item.object && item.object.type === "Note" && !isDM(item.object)) {
                    allMessages.push(item.object);
                }
            });
        } catch (e) {
            console.error("Drive에서 JSON 불러오기 실패:", e);
        }
    }
    return allMessages;
}

// 선택된 캐릭터 JSON 로드
async function loadSelectedJsonFiles(selectedNames) {
    const allMessages = [];
    for (let name of selectedNames) {
        const char = characters[name];
        if (!char) continue;
        try {
            const data = await fetchJsonFromDrive(char.fileName);
            (data.orderedItems || []).forEach(item => {
                if (item.object && item.object.type === "Note" && !isDM(item.object)) {
                    allMessages.push(item.object);
                }
            });
        } catch (e) {
            console.error("JSON 불러오기 실패:", e);
        }
    }
    return allMessages;
}

// 스레드 수집
function collectThreads(messages) {
    const idMap = {}, repliesTo = {};
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
        (repliesTo[id] || []).forEach(reply => thread = thread.concat(dfs(reply.id, visited)));
        return thread;
    }

    return messages.filter(m => !m.inReplyTo).map(m => dfs(m.id)).filter(t => t.length > 1);
}

// Google Sheets 초기화
async function initApp() {
    try {
        const res = await fetch("./config.json");
        const config = await res.json();
        CLIENT_ID = config.CLIENT_ID;
        API_KEY = config.API_KEY;
        driveFiles = config.driveFiles;

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
                accessToken = tokenResponse.access_token; // 여기에 할당
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

function generateCharacterCheckboxes() {
    const container = document.getElementById("characterList");
    Object.entries(characters).forEach(([name, obj]) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = name;
        input.disabled = !obj.enabled; // false면 체크 불가
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + name));
        container.appendChild(label);
    });

    // 체크박스 선택 제한 (최대 2개)
    container.addEventListener("change", () => {
        const checked = container.querySelectorAll("input:checked");
        if (checked.length > 2) {
            alert("최대 2개까지 선택 가능합니다.");
            checked[checked.length - 1].checked = false; // 마지막 클릭한 거 해제
        }
    });
}

// UTC → KST
function toKST(utc) {
    return new Date(new Date(utc).getTime() + 9*60*60*1000)
        .toISOString().replace("T", " ").substring(0,19);
}

// 버튼 이벤트
document.getElementById("authBtn").addEventListener("click", () => {
    if (!gapiInited || !gisInited) return alert("Google API 초기화가 안 됐습니다.");
    tokenClient.requestAccessToken({ prompt: 'consent' });
});

const excludeMentions = ["@Limone", "@jackson", "@Kevin_Vance", "@Guinevere", "@NOTICE", "@STORY", "@Paradise"];

document.getElementById("uploadBtn").addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll("#characterList input:checked")).map(i => i.value);
    if (!selected.length) return alert("캐릭터를 선택하세요!");

    const sheetName = document.getElementById("sheetName").value || "역극백업";
    const allMessages = await loadSelectedJsonFiles(selected);
    const threads = collectThreads(allMessages);

    const records = [["날짜","카테고리","작성자","내용"]];
    let category = 1;
    threads.forEach(thread => {
        // 시간 순 정렬
        thread.sort((a,b) => new Date(a.published) - new Date(b.published)).forEach(msg => {
            const contentText = cleanText(msg.contentMap?.ko || msg.content || "");

            // 여기서 excluded mention 체크
            const startsWithExcluded = excludeMentions.some(mention => contentText.content.trim().startsWith(mention));
            if (startsWithExcluded) return; // 제외

            records.push([
                toKST(msg.published),
                category,
                idToName[msg.attributedTo?.split("/").pop()] || msg.attributedTo?.split("/").pop(),
                contentText.content
            ]);
        });
        category++;
    });

    const response = await gapi.client.sheets.spreadsheets.create({ properties: { title: sheetName } });
    const spreadsheetId = response.result.spreadsheetId;
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "A1",
        valueInputOption: "RAW",
        resource: { values: records }
    });

    navigator.clipboard.writeText(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
    alert("시트 생성 완료! 링크가 클립보드에 복사되었습니다.");
});

// 초기화
window.addEventListener("DOMContentLoaded", () => {
    generateCharacterCheckboxes();
    initApp();
});