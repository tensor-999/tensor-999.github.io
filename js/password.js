document.addEventListener("DOMContentLoaded", async () => {
    // config.json에서 비밀번호 읽기
    let password = "";
    try {
        const res = await fetch("./config.json");
        const config = await res.json();
        password = config.PASSWORD;
    } catch (e) {
        console.error("config.json 읽기 실패", e);
        return;
    }

    // 낙원존재론 링크 선택
    const protectedLinks = document.querySelectorAll('a[href^="./paradise"]');

    protectedLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault(); // 링크 기본 동작 막기
            const userInput = prompt("비밀번호를 입력하세요: ");
            if (userInput === password)
                window.location.href = link.href;
            else if (userInput == null)
                return;
            else
                alert("비밀번호가 틀렸습니다!");
        });
    });
});