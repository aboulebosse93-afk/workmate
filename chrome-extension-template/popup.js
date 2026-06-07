document.getElementById('send').onclick = async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  chrome.tabs.sendMessage(tab.id, {type:'WORKMATE_CAPTURE'});
};