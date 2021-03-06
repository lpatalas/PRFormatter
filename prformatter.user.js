// ==UserScript==
// @name         BitbucketPrFormatter
// @namespace    http://lukaszpatalas.pl/
// @version      1.3
// @description  Bitbucket PR commit message formatter
// @author       Łukasz Patalas
// @match        https://bitbucket.org/*/pull-requests/*
// @grant        none
// ==/UserScript==
(function () {
    'use strict';
    const pathRegex = /\/pull-requests\/\d+(\/.+)?$/;
    if (!pathRegex.test(window.location.pathname)) {
        console.log('PRFormatter will not be enabled because URL does not match pattern');
        return;
    }
    waitForElement(findMergeButton, mergeButton => {
        mergeButton.addEventListener('click', () => {
            waitForElement(findPullRequestDialog, onMergeDialogShown);
        });
    });
    function findMergeButton() {
        const oldVersionButton = document.getElementById('fulfill-pullrequest');
        if (oldVersionButton) {
            return oldVersionButton;
        }
        const buttons = document.querySelectorAll('button');
        for (let button of buttons) {
            if (button.innerText.toLowerCase().trim() === 'merge') {
                return button;
            }
        }
        return null;
    }
    function findPullRequestDialog() {
        const oldDialog = document.getElementById('bb-fulfill-pullrequest-dialog');
        if (oldDialog) {
            return oldDialog;
        }
        const mergeDialogHeaders = document.querySelectorAll('div[role="dialog"] h4');
        for (let header of mergeDialogHeaders) {
            if (header.innerText.toLowerCase().trim() === 'merge pull request') {
                return findParentDialog(header);
            }
        }
        return null;
    }
    function findParentDialog(dialogElement) {
        let parent = dialogElement.parentElement;
        while (parent) {
            if (parent.getAttribute('role') === 'dialog') {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    }
    function findCommitMessageTextArea(dialog) {
        return function () {
            const oldTextArea = document.getElementById('id_commit_message');
            if (oldTextArea) {
                return oldTextArea;
            }
            const textAreas = document.querySelectorAll('textarea');
            for (let textArea of textAreas) {
                if (isChildOf(textArea, dialog)) {
                    return textArea;
                }
            }
            return null;
        };
    }
    function isChildOf(element, parentElement) {
        let currentElement = element.parentElement;
        while (currentElement) {
            if (currentElement === parentElement) {
                return true;
            }
            currentElement = currentElement.parentElement;
        }
        return null;
    }
    function onMergeDialogShown(dialog) {
        try {
            const prUrl = getPullRequestApiUrl();
            apiGet(prUrl).then(pullRequest => {
                waitForElement(findCommitMessageTextArea(dialog), textArea => {
                    fillCommitMessage(dialog, textArea, pullRequest);
                });
            }).catch(reportError);
        }
        catch (error) {
            reportError(error);
        }
    }
    function fillCommitMessage(dialog, commitMessageTextArea, pullRequest) {
        adjustTextAreaStyles(dialog, commitMessageTextArea);
        const parsedDescription = parseDescription(pullRequest.description);
        console.debug('Parsed description:', parsedDescription);
        var approvedByTrailers = extractApprovedByTrailers(commitMessageTextArea.value);
        console.debug('approvedByTrailers', approvedByTrailers);
        const lines = [pullRequest.title];
        if (parsedDescription.text) {
            lines.push('', parsedDescription.text);
        }
        lines.push('', ...parsedDescription.trailers, `PR: ${pullRequest.id}`, ...approvedByTrailers);
        commitMessageTextArea.value = concatLines(lines);
    }
    function adjustTextAreaStyles(dialog, textArea) {
        dialog.style.width = '1000px';
        textArea.style.fontFamily = 'monospace';
        textArea.style.minHeight = '400px';
        textArea.style.minWidth = '100%';
        addGuideline(textArea, 50, '#8886', 'CommitSubjectGuideline');
        addGuideline(textArea, 72, '#f008', 'CommitBodyGuideline');
    }
    function addGuideline(textArea, characterOffset, color, id) {
        const textAreaStyle = window.getComputedStyle(textArea);
        const glyphWidth = measureGlyphWidth(textAreaStyle);
        const guidelineOffset = Math.floor(glyphWidth * characterOffset);
        const guidelineDiv = getOrCreateDiv(id);
        guidelineDiv.style.borderRight = `dashed 1px ${color}`;
        guidelineDiv.style.bottom = '0';
        guidelineDiv.style.marginLeft = textAreaStyle.paddingLeft;
        guidelineDiv.style.pointerEvents = 'none';
        guidelineDiv.style.position = 'absolute';
        guidelineDiv.style.top = '0';
        guidelineDiv.style.width = `${guidelineOffset}px`;
        const textAreaParent = textArea.parentElement;
        if (textAreaParent) {
            textAreaParent.appendChild(guidelineDiv);
        }
    }
    function getOrCreateDiv(id) {
        const div = document.getElementById(id) || document.createElement('div');
        div.id = id;
        return div;
    }
    function measureGlyphWidth(style) {
        const font = `${style.fontSize} ${style.fontFamily}`;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = font;
        console.log(`Measuring text for font ${context.font} (desired: ${font})`);
        const width = context.measureText(' ').width;
        console.log(`Measured width: ${width}`);
        return width;
    }
    const emptyLineRegex = /^\w*$/;
    const trailerRegex = /^[A-Z_-]+: .+$/i;
    function parseDescription(text) {
        const lines = text.split('\r\n');
        const trailers = [];
        let descriptionLineCount = lines.length;
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (trailerRegex.test(line)) {
                console.debug('Trailer', line);
                trailers.push(line);
                descriptionLineCount--;
            }
            else if (emptyLineRegex.test(line)) {
                console.debug('Empty', line);
                descriptionLineCount--;
            }
            else {
                console.debug('Break', line);
                break;
            }
        }
        return {
            text: concatLines(lines.slice(0, descriptionLineCount)),
            trailers: trailers
        };
    }
    const approvedByRegex = /^Approved-by: .+$/gm;
    function extractApprovedByTrailers(text) {
        return text.match(approvedByRegex) || [];
    }
    function concatLines(lines) {
        return lines.join('\r\n');
    }
    const pageUrlRegex = /\/(.+)\/pull-requests\/(\d+)/;
    function getPullRequestApiUrl() {
        const pageUrl = document.location.pathname;
        const matches = pageUrlRegex.exec(pageUrl);
        if (!matches) {
            throw new Error(`Cannot match repo and PR id from pathname "${pageUrl}"`);
        }
        const apiBaseUrl = 'https://api.bitbucket.org/2.0';
        const repoSlug = matches[1];
        const prId = matches[2];
        return `${apiBaseUrl}/repositories/${repoSlug}/pullrequests/${prId}`;
    }
    function apiGet(url) {
        const apiToken = getApiToken();
        console.debug('apiGet', { url, apiToken });
        const fetchPromise = fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            }
        });
        return fetchPromise
            .then(function (response) {
            if (response.status === 200) {
                return response.json();
            }
            else if (response.status === 401) {
                return Promise.reject('BitBucket API token expired.'
                    + ' You can fill message manually'
                    + ' or hard-refresh page (Ctrl+F5) and try again.');
            }
            else {
                return Promise.reject(`BitBucket API returned status: ${response.status} ${response.statusText}`);
            }
        })
            .then(function (pullRequestData) {
            console.debug('PullRequest:', pullRequestData);
            return pullRequestData;
        });
    }
    function getApiToken() {
        const meta = document.querySelector('meta[name="apitoken"]');
        if (!meta) {
            throw new Error('Cannot find <meta name="apitoken"> element');
        }
        const tokenContent = JSON.parse(meta.content);
        return tokenContent.token;
    }
    const MAX_WAIT_ATTEMPTS = 10;
    function waitForElement(elementFinder, callback, attempt) {
        attempt = attempt || 0;
        const element = elementFinder();
        if (element) {
            callback(element);
        }
        else if (attempt && attempt >= MAX_WAIT_ATTEMPTS) {
            throw new Error(`Maximum number of attempts reached when searching for element using "${elementFinder.name}"`);
        }
        else {
            const nextAttempt = (attempt || 0) + 1;
            console.debug(`Function "${elementFinder.name}" did not find the element. Attempt ${nextAttempt}/${MAX_WAIT_ATTEMPTS}`);
            setTimeout(() => {
                waitForElement(elementFinder, callback, nextAttempt);
            }, 100);
        }
    }
    function reportError(error) {
        console.error(error);
        const message = error instanceof Error ? error.message : error;
        showToast(`PRFormatter error: ${message}`);
    }
    function showToast(message) {
        const container = document.createElement('div');
        container.style.background = 'red';
        container.style.color = 'white';
        container.style.fontWeight = 'bold';
        container.style.height = '20pt';
        container.style.left = '0';
        container.style.position = 'fixed';
        container.style.right = '0';
        container.style.textAlign = 'center';
        container.style.top = '0';
        container.style.verticalAlign = 'center';
        container.style.zIndex = '10000';
        const text = document.createElement('span');
        text.innerText = message;
        const closeButton = document.createElement('a');
        closeButton.style.color = 'white';
        closeButton.style.cursor = 'pointer';
        closeButton.style.height = '20pt';
        closeButton.style.position = 'absolute';
        closeButton.style.right = '0';
        closeButton.style.top = '0';
        closeButton.style.width = '20pt';
        closeButton.innerHTML = 'X';
        closeButton.addEventListener('click', e => {
            document.body.removeChild(container);
            e.preventDefault();
            return true;
        });
        container.appendChild(text);
        container.appendChild(closeButton);
        document.body.appendChild(container);
    }
})();
