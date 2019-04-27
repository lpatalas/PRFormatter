// ==UserScript==
// @name         Bitbucket PR
// @namespace    http://example.com/
// @version      1.0
// @description  Test
// @author       Lukasz
// @match        https://bitbucket.org/*/pull-requests/*
// @grant        none
// ==/UserScript==

interface PullRequest {
    id: number;
    title: string;
    description: string;
}

(function () {
    'use strict';

    const mergeButton = document.getElementById('fulfill-pullrequest');
    if (!mergeButton) {
        console.error('Cannot find button by id "fulfill-pullrequest"');
        return;
    }

    mergeButton.addEventListener('click', function () {
        setTimeout(onMergeDialogShown, 100);
    });

    function onMergeDialogShown() {
        const dialog = document.getElementById('bb-fulfill-pullrequest-dialog');
        if (!dialog) {
            setTimeout(onMergeDialogShown, 100);
            return;
        }

        try {
            modifyMergeDialog();
        }
        catch (error) {
            console.log(error);
        }
    }

    function modifyMergeDialog() {
        const apiToken = getApiToken();
        console.debug('apiToken', apiToken);

        const prUrl = 'https://api.bitbucket.org/2.0/repositories/lpatalas/merge-test/pullrequests/3';
        apiGet(prUrl).then(fillCommitMessage);
    }

    function fillCommitMessage(pullRequest: PullRequest) {
        const commitMessageTextArea = document.getElementById('id_commit_message') as HTMLTextAreaElement;
        if (!commitMessageTextArea) {
            throw new Error('Cannot find element "id_commit_message"');
        }

        adjustTextAreaStyles(commitMessageTextArea);

        const parsedDescription = parseDescription(pullRequest.description);
        console.debug('Parsed description:', parsedDescription);

        commitMessageTextArea.value = concatLines([
            pullRequest.title,
            '',
            parsedDescription.text,
            '',
            ...parsedDescription.trailers,
            `PR: ${pullRequest.id}`
        ]);
    }

    function adjustTextAreaStyles(textArea: HTMLTextAreaElement) {
        textArea.style.fontFamily = 'monospace';
        textArea.style.minHeight = '400px';
    }

    const emptyLineRegex = /^\w*$/;
    const trailerRegex = /^[A-Z_-]+: .+$/i;

    function parseDescription(text: string) {
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

    function concatLines(lines: readonly string[]) {
        return lines.join('\r\n');
    }

    function apiGet(url: string) {
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
            .catch(function (error) {
                console.error(error);
            });
    }

    function getApiToken(): string {
        const meta = document.querySelector('meta[name="apitoken"]') as HTMLMetaElement;
        if (!meta) {
            throw new Error('Cannot find <meta name="apitoken"> element');
        }

        const tokenContent = JSON.parse(meta.content);
        return tokenContent.token;
    }
})();
