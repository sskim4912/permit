// Install support is optional; it must not block the application.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'}).catch(() => {});
  });
}
const installButton = document.getElementById('installApp');
let installPrompt;
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  if (installButton) installButton.hidden = true;
});
if (installButton) {
  installButton.hidden = standalone();
  installButton.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      try {
        await prompt.prompt();
        await prompt.userChoice;
        return;
      } catch (_) { /* Offer manual instructions if the browser declines the prompt. */ }
    }
    let dialog = document.getElementById('installHelp');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'installHelp';
      dialog.className = 'install-help';
      dialog.setAttribute('aria-labelledby', 'installHelpTitle');
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      dialog.innerHTML = '<div class="section-title"><h2 id="installHelpTitle">홈 화면에 추가</h2><button type="button" class="close" aria-label="안내 닫기">×</button></div>' +
        (ios ? '<p>아이폰에서는 Safari에서 이 페이지를 열어 주세요.</p><ol><li>Safari의 <strong>공유 버튼</strong>을 누르세요.</li><li><strong>홈 화면에 추가</strong>를 선택하세요.</li><li>이름이 <strong>출입신청</strong>인지 확인하고 <strong>추가</strong>를 누르세요.</li></ol><p class="muted">다른 앱에서 열었다면 링크를 복사해 Safari 주소창에 붙여 넣어 주세요. 아이폰은 자동 설치를 지원하지 않습니다.</p>' : '<p>브라우저 메뉴에서 홈 화면에 추가할 수 있습니다.</p><ol><li>Chrome 오른쪽 위 <strong>⋮ 메뉴</strong>를 누르세요.</li><li><strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택하세요.</li><li>표시되는 안내에 따라 추가하세요.</li></ol><p class="muted">카카오톡 등 앱 안에서 열었다면 Chrome으로 열어 주세요. PC에서는 주소창의 설치 아이콘이나 브라우저 메뉴를 이용하세요.</p>') +
        '<button type="button" class="primary">확인</button>';
      dialog.querySelectorAll('button').forEach(button => button.addEventListener('click', () => dialog.close()));
      document.body.append(dialog);
    }
    dialog.showModal();
  });
}
