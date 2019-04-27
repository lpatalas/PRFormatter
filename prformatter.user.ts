// ==UserScript==
// @name         BitbucketPrFormatter
// @namespace    http://lukaszpatalas.pl/
// @version      1.0
// @description  Bitbucket PR commit message formatter
// @author       Łukasz Patalas
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

    mergeButton.addEventListener('click', () => {
        waitForElement('bb-fulfill-pullrequest-dialog', onMergeDialogShown);
    })

    function onMergeDialogShown() {
        try {
            const prUrl = getPullRequestApiUrl();
            apiGet(prUrl).then(pullRequest => {
                waitForElement<HTMLTextAreaElement>('id_commit_message', element => {
                    fillCommitMessage(element, pullRequest);
                });
            });
        }
        catch (error) {
            console.log(error);
        }
    }

    function fillCommitMessage(commitMessageTextArea: HTMLTextAreaElement, pullRequest: PullRequest) {
        adjustTextAreaStyles(commitMessageTextArea);

        const parsedDescription = parseDescription(pullRequest.description);
        console.debug('Parsed description:', parsedDescription);

        var approvedByTrailers = extractApprovedByTrailers(commitMessageTextArea.value);
        console.debug('approvedByTrailers', approvedByTrailers);

        commitMessageTextArea.value = concatLines([
            pullRequest.title,
            '',
            parsedDescription.text,
            '',
            ...parsedDescription.trailers,
            `PR: ${pullRequest.id}`,
            ...approvedByTrailers
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

    const approvedByRegex = /^Approved-by: .+$/gm;

    function extractApprovedByTrailers(text: string): string[] {
        return text.match(approvedByRegex) || [];
    }

    function concatLines(lines: readonly string[]) {
        return lines.join('\r\n');
    }

    const pageUrlRegex = /\/(.+)\/pull-requests\/(\d+)/;

    function getPullRequestApiUrl() {
        const pageUrl = document.location.pathname;
        const matches = pageUrlRegex.exec(pageUrl);
        if (!matches) {
            throw new Error(`Cannot match repo and PR id from pathname "${pageUrl}"`);
        }

        const apiBaseUrl = 'https://api.bitbucket.org/2.0'
        const repoSlug = matches[1];
        const prId = matches[2];

        return `${apiBaseUrl}/repositories/${repoSlug}/pullrequests/${prId}`;
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
            .then(function(response) {
                if (response.status === 200) {
                    return response.json();
                }
                else {
                    return Promise.reject(`API returned status: ${response.status} ${response.statusText}`);
                }
            })
            .then(function(pullRequestData) {
                console.debug('PullRequest:', pullRequestData);
                return pullRequestData;
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

    const MAX_WAIT_ATTEMPTS = 10;

    function waitForElement<T extends HTMLElement>(elementId: string, callback: (element: T) => void, attempt?: number) {
        attempt = attempt || 0;

        const element = document.getElementById(elementId) as T;
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
})();
