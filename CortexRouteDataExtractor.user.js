// ==UserScript==
// @name         Cortex Route Data Extractor
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Extract route data from Cortex
// @author       yuyna
// @icon         https://www.google.com/s2/favicons?sz=64&domain=amazon.com
// @updateURL    https://raw.githubusercontent.com/yuyna-amazon/CortexRouteDataExtractor/main/CortexRouteDataExtractor.user.js
// @downloadURL  https://raw.githubusercontent.com/yuyna-amazon/CortexRouteDataExtractor/main/CortexRouteDataExtractor.user.js
// @match        https://logistics.amazon.co.jp/internal/operations/execution/dv/routes*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ボタンが既に存在するかチェック
    function buttonExists() {
        return document.getElementById('cortex-route-extractor-btn') !== null;
    }

    // ダウンロードボタンを作成してナビゲーションに追加
    function createDownloadButton() {
        if (buttonExists()) {
            console.log('[Route Extractor] Button already exists');
            return;
        }

        console.log('[Route Extractor] Attempting to create button...');

        // 複数のセレクタを試す
        const navSelectors = [
            'ul.fp-nav-menu-list',
            'nav ul',
            'header ul',
            '[class*="nav"] ul',
            '[class*="menu"] ul'
        ];

        let navMenu = null;
        for (const selector of navSelectors) {
            navMenu = document.querySelector(selector);
            if (navMenu) {
                console.log('[Route Extractor] Found nav with selector:', selector);
                break;
            }
        }

        if (navMenu) {
            const listItem = document.createElement('li');
            listItem.className = 'fp-nav-menu-list-item';
            listItem.style.cssText = 'margin-left: auto; padding: 0 20px;';

            const button = document.createElement('a');
            button.id = 'cortex-route-extractor-btn';
            button.href = '#';
            button.style.cssText = `
                background-color: #FF9900;
                color: #000000;
                padding-top: 8px;
                padding-bottom: 8px;
                padding-left: 30px;
                padding-right: 30px;
                border-radius: 0;
                text-decoration: none;
                font-weight: bold;
                cursor: pointer;
                display: inline-block;
                white-space: nowrap;
            `;
            button.innerText = 'Route data';
            button.addEventListener('click', function(e) {
                e.preventDefault();
                startExtraction();
            });

            listItem.appendChild(button);
            navMenu.appendChild(listItem);
            console.log('[Route Extractor] Button added to nav');
        } else {
            console.log('[Route Extractor] Nav not found, creating fixed button');
            createFixedButton();
        }
    }

    function createFixedButton() {
        if (buttonExists()) {
            return;
        }

        const button = document.createElement('button');
        button.id = 'cortex-route-extractor-btn';
        button.textContent = 'Route data';
        button.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            z-index: 999999;
            padding: 12px 30px;
            background-color: #FF9900;
            color: #000000;
            border: 2px solid #000;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 4px 8px rgba(0,0,0,0.4);
            font-family: Arial, sans-serif;
        `;
        button.addEventListener('click', startExtraction);
        document.body.appendChild(button);
        console.log('[Route Extractor] Fixed button created');
    }

    // datepickerから日付を取得（ファイル名用: YYYY-MM-DD形式）
    function getDateForFileName() {
        const datepicker = document.querySelector('input[id^="datepicker"]');
        if (datepicker && datepicker.value) {
            const parts = datepicker.value.split('/');
            if (parts.length === 3) {
                const month = parts[0];
                const day = parts[1];
                const year = parts[2];
                return `${year}-${month}-${day}`;
            }
        }
        return new Date().toISOString().slice(0, 10);
    }

    // datepickerから日付を取得（CSV用: YYYY/M/D形式、ゼロパディングなし）
    function getDateForCSV() {
        const datepicker = document.querySelector('input[id^="datepicker"]');
        if (datepicker && datepicker.value) {
            const parts = datepicker.value.split('/');
            if (parts.length === 3) {
                const month = parseInt(parts[0], 10);
                const day = parseInt(parts[1], 10);
                const year = parts[2];
                return `${year}/${month}/${day}`;
            }
        }
        const today = new Date();
        return `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
    }

    function getCycle(departureTime) {
        if (!departureTime) return '';

        const timeParts = departureTime.match(/(\d+):(\d+)/);
        if (!timeParts) return '';

        const hours = parseInt(timeParts[1], 10);
        const minutes = parseInt(timeParts[2], 10);
        const totalMinutes = hours * 60 + minutes;

        if (totalMinutes >= 0 && totalMinutes < 420) return 'SSD1';
        if (totalMinutes >= 420 && totalMinutes < 600) return 'SSD3';
        if (totalMinutes >= 600 && totalMinutes < 840) return 'SSD4';
        if (totalMinutes >= 840 && totalMinutes < 1020) return 'SSD5';
        if (totalMinutes >= 1020 && totalMinutes < 1200) return 'SSD7';
        if (totalMinutes >= 1200 && totalMinutes < 1440) return 'SSD8';

        return '';
    }

    function getCycleOrder(cycle) {
        const order = {
            'SSD1': 1,
            'SSD3': 2,
            'SSD4': 3,
            'SSD5': 4,
            'SSD7': 5,
            'SSD8': 6
        };
        return order[cycle] || 99;
    }

    function durationToMinutes(duration) {
        if (!duration) return 0;

        let totalMinutes = 0;

        const hoursMatch = duration.match(/(\d+)\s*時間/);
        if (hoursMatch) {
            totalMinutes += parseInt(hoursMatch[1], 10) * 60;
        }

        const minutesMatch = duration.match(/(\d+)\s*分/);
        if (minutesMatch) {
            totalMinutes += parseInt(minutesMatch[1], 10);
        }

        return totalMinutes;
    }

    function sortData(data) {
        return data.sort((a, b) => {
            const cycleOrderA = getCycleOrder(a.Cycle);
            const cycleOrderB = getCycleOrder(b.Cycle);

            if (cycleOrderA !== cycleOrderB) {
                return cycleOrderA - cycleOrderB;
            }

            const durationA = durationToMinutes(a['Route所要時間']);
            const durationB = durationToMinutes(b['Route所要時間']);

            return durationB - durationA;
        });
    }

    function extractDataFromCard(card) {
        try {
            const routeCodeElement = card.querySelector('p.css-gu3i3q span');
            const routeCode = routeCodeElement ? routeCodeElement.textContent.trim() : '';

            if (!routeCode) return null;

            const timeSpans = card.querySelectorAll('span.css-rrx4zr');
            let routeDuration = '';
            let departureTime = '';

            if (timeSpans.length >= 1) {
                routeDuration = timeSpans[0].textContent.trim();
            }
            if (timeSpans.length >= 2) {
                departureTime = timeSpans[1].textContent.trim();
            }

            let shipCount = '';
            const allParagraphs = card.querySelectorAll('p.css-nqman4');
            for (const p of allParagraphs) {
                if (p.textContent.includes('配達')) {
                    const shipSpan = p.querySelector('span[style*="font-weight"]');
                    if (shipSpan) {
                        const shipText = shipSpan.textContent.trim();
                        const shipMatch = shipText.match(/\d+\/(\d+)/);
                        if (shipMatch) {
                            shipCount = parseInt(shipMatch[1], 10);
                        }
                    }
                    break;
                }
            }

            const cycle = getCycle(departureTime);

            return {
                Cycle: cycle,
                RouteCode: routeCode,
                'Route所要時間': routeDuration,
                '出発時間': departureTime,
                'Ship数': shipCount
            };
        } catch (e) {
            console.error('Error extracting data from card:', e);
            return null;
        }
    }

    async function startExtraction() {
        const data = new Map();

        const scrollContainer = document.querySelector('div[data-virtuoso-scroller="true"]');
        if (!scrollContainer) {
            alert('スクロールコンテナが見つかりません。ページを再読み込みしてください。');
            return;
        }

        const progressDiv = document.createElement('div');
        progressDiv.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            z-index: 9999999;
            padding: 10px 20px;
            background-color: #232F3E;
            color: white;
            border-radius: 5px;
            font-size: 14px;
        `;
        progressDiv.textContent = 'データ収集中... 0件';
        document.body.appendChild(progressDiv);

        window.scrollTo(0, 0);
        await sleep(500);

        let lastDataCount = 0;
        let noNewDataCount = 0;
        const maxNoNewData = 5;

        while (noNewDataCount < maxNoNewData) {
            const cards = document.querySelectorAll('div[data-index] div.css-7v14zu');

            cards.forEach((card) => {
                const rowData = extractDataFromCard(card);
                if (rowData && rowData.RouteCode) {
                    const key = rowData.RouteCode + '_' + rowData['出発時間'];
                    if (!data.has(key)) {
                        data.set(key, rowData);
                    }
                }
            });

            progressDiv.textContent = 'データ収集中... ' + data.size + '件';

            if (data.size === lastDataCount) {
                noNewDataCount++;
            } else {
                noNewDataCount = 0;
                lastDataCount = data.size;
            }

            window.scrollBy(0, 500);
            await sleep(300);
        }

        progressDiv.textContent = 'ソート中...';
        await sleep(100);

        const dataArray = Array.from(data.values());
        const sortedData = sortData(dataArray);

        document.body.removeChild(progressDiv);

        if (sortedData.length > 0) {
            downloadCSV(sortedData);
        } else {
            alert('データが見つかりませんでした。');
        }

        window.scrollTo(0, 0);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function downloadCSV(data) {
        const headers = ['Day', 'Cycle', 'RouteCode', 'Route所要時間', '出発時間', 'Ship数'];
        const selectedDateForCSV = getDateForCSV();
        const selectedDateForFile = getDateForFileName();

        let csvContent = '\uFEFF';
        csvContent += headers.join(',') + '\n';

        data.forEach(row => {
            const values = headers.map(header => {
                let value;
                if (header === 'Day') {
                    value = selectedDateForCSV;
                } else {
                    value = row[header] !== undefined ? row[header] : '';
                }
                if (String(value).includes(',') || String(value).includes('\n')) {
                    value = '"' + String(value).replace(/"/g, '""') + '"';
                }
                return value;
            });
            csvContent += values.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.setAttribute('href', url);
        link.setAttribute('download', 'route_data_' + selectedDateForFile + '.csv');
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // 初期化関数
    function init() {
        console.log('[Route Extractor] Initializing...');
        createDownloadButton();
    }

    // 複数の方法で初期化を試みる
    if (document.readyState === 'complete') {
        setTimeout(init, 1000);
    } else {
        window.addEventListener('load', function() {
            setTimeout(init, 2000);
        });
    }

    // さらに遅延して再試行
    setTimeout(init, 3000);
    setTimeout(init, 5000);

})();
