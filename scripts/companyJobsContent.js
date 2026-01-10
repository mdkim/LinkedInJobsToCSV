chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'insert_div') {
        const targetDiv = document.querySelector('div.org-top-card__primary-content.org-top-card-primary-content--zero-height-logo');
        targetDiv.parentElement.insertAdjacentHTML('afterend', msg.divHTML);
    }
});