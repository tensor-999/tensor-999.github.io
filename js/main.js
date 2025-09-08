let CLIENT_ID;
let API_KEY;
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient;
let gapiInited = false;
let gisInited = false;

async function initApp() {
    try {
        // config.json 로드
        const res = await fetch('./config.json');
        const config = await res.json();
        CLIENT_ID = config.CLIENT_ID;
        API_KEY = config.API_KEY;
        console.log("Config loaded");

        // gapi 초기화
        await new Promise(resolve => {
            gapi.load('client', async () => {
                await gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
                });
                gapiInited = true;
                resolve();
            });
        });

        // GIS 초기화
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                document.getElementById("uploadBtn").disabled = false;
            },
        });
        gisInited = true;

    } catch (err) {
        console.error("config.json 로드 실패", err);
    }
}

// 페이지 로드 후 초기화
window.onload = () => {
    initApp();
};

// 로그인 버튼
document.getElementById("authBtn").addEventListener("click", () => {
    if (!gapiInited || !gisInited) {
        alert("Google API 초기화가 아직 안 됐습니다.");
        return;
    }
    tokenClient.requestAccessToken();
});

// 한국 시간 변환
function toKST(utcString) {
    if (!utcString) return "";
    const date = new Date(utcString);
    const kst = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    return kst.toISOString().replace("T", " ").substring(0, 19);
}

// HTML 제거 + 대상(@...) 분리
function parseContent(htmlString) {
    if (!htmlString) return { target: "", content: "" };

    // DOMParser로 HTML 파싱
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const text = doc.body.textContent || "";

    // @으로 시작하는 첫 단어 추출
    let target = "";
    let mainContent = text;
    const match = text.match(/^(@\S+)\s*(.*)/);
    if (match) {
        target = match[1];
        mainContent = match[2];
    }

    return { target, content: mainContent };
}

// 업로드 버튼
document.getElementById("uploadBtn").addEventListener("click", async () => {
    const fileInput = document.getElementById("fileInput").files[0];
    if (!fileInput) { alert("캐릭터의 JSON 파일을 업로드하세요🥰"); return; }

    const sheetName = document.getElementById("sheetName").value || "역극백업";
    const text = await fileInput.text();
    const raw = JSON.parse(text);

    const records = [["날짜", "대상", "내용"]];
    raw["orderedItems"].forEach(item => {
        const obj = item["object"] || {};
        const content = obj?.contentMap?.ko || "";
        const published = obj?.published || "";
        if (content) {
            const parsed = parseContent(content);
            records.push([toKST(published), parsed.target, parsed.content]);
        }
    });

    // 시트 생성
    const response = await gapi.client.sheets.spreadsheets.create({
        properties: { title: sheetName }
    });

    const spreadsheetId = response.result.spreadsheetId;

    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: "A1",
        valueInputOption: "RAW",
        resource: { values: records }
    });

    const url = "https://docs.google.com/spreadsheets/d/" + spreadsheetId;
    navigator.clipboard.writeText(url).then(() => {
        alert("시트 생성 완료! 링크가 클립보드에 복사되었습니다.");
    });
});