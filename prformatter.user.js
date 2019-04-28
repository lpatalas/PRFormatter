// ==UserScript==
// @name         BitbucketPrFormatter
// @namespace    http://lukaszpatalas.pl/
// @version      1.0
// @description  Bitbucket PR commit message formatter
// @author       Łukasz Patalas
// @match        https://bitbucket.org/*/pull-requests/*
// @grant        none
// ==/UserScript==
(function () {
    'use strict';
    const mergeButton = document.getElementById('fulfill-pullrequest');
    if (!mergeButton) {
        console.error('Cannot find button by id "fulfill-pullrequest"');
        return;
    }
    mergeButton.addEventListener('click', () => {
        waitForElement('bb-fulfill-pullrequest-dialog', onMergeDialogShown);
    });
    function onMergeDialogShown() {
        try {
            const prUrl = getPullRequestApiUrl();
            apiGet(prUrl).then(pullRequest => {
                waitForElement('id_commit_message', element => {
                    fillCommitMessage(element, pullRequest);
                });
            });
        }
        catch (error) {
            console.log(error);
            showToast(`PrFormatter error: ${error.message}`);
        }
    }
    function fillCommitMessage(commitMessageTextArea, pullRequest) {
        adjustTextAreaStyles(commitMessageTextArea);
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
    function adjustTextAreaStyles(textArea) {
        textArea.style.fontFamily = 'monospace';
        textArea.style.minHeight = '400px';
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
            else {
                return Promise.reject(`API returned status: ${response.status} ${response.statusText}`);
            }
        })
            .then(function (pullRequestData) {
            console.debug('PullRequest:', pullRequestData);
            return pullRequestData;
        })
            .catch(function (error) {
            console.error(error);
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
    function waitForElement(elementId, callback, attempt) {
        attempt = attempt || 0;
        const element = document.getElementById(elementId);
        if (element) {
            callback(element);
        }
        else if (attempt && attempt >= MAX_WAIT_ATTEMPTS) {
            throw new Error(`Maximum number of attempts reached when waiting for element "${elementId}"`);
        }
        else {
            const nextAttempt = (attempt || 0) + 1;
            console.debug(`Element "${elementId}" not found. Attempt ${nextAttempt}/${MAX_WAIT_ATTEMPTS}`);
            setTimeout(() => {
                waitForElement(elementId, callback, nextAttempt);
            }, 100);
        }
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
