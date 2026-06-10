chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WORKMATE_CAPTURE') {
    const text = document.body.innerText.slice(0, 12000);
    const url = 'https://workmate-gamma.vercel.app/?capture=' + encodeURIComponent(text);
    window.open(url, '_blank');
  }
});