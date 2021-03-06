const separator = " ::: ";

function extractBookmarks(browserBookmarks, parents) {
    if (typeof parents === 'undefined') {
        parents = [];
    }
    var returnedBookmars = [];
    browserBookmarks.forEach(function (browserBookmark) {
        if (shouldProcessBookmark(browserBookmark)) {
            returnedBookmars.push({
                id: browserBookmark.id,
                parents: parents.slice(0),
                url: browserBookmark.url,
                oldTitle: browserBookmark.title
            });
        } else if (browserBookmark.type === 'folder') {
            var childParents = parents.slice(0);
            var currentTitle = getBookmarkTitle(browserBookmark);
            if(browserBookmark.id.indexOf('_____') === -1){
                childParents.push(currentTitle);
            }
            const childBookmarks = extractBookmarks(browserBookmark.children, childParents);
            Array.prototype.push.apply(returnedBookmars, childBookmarks);
        }
    }, this);
    return returnedBookmars;
}

function getBookmarkTitle(browserBookmark){
    if (browserBookmark.id === "root________") {
        return '';
    } else {
        return browserBookmark.title;
    }
}

function shouldProcessBookmark(browserBookmark) {
    return browserBookmark.type === 'bookmark' && browserBookmark.url.indexOf('place:') === -1;
}

function getFolderParts(parents) {
    var concatenatedDirectories = "";
    parents.forEach(function (parent) {
        concatenatedDirectories = concatenatedDirectories + "f" + parent.toLowerCase().replace(" ", "") + " ";
    });
    return concatenatedDirectories.substr(0, concatenatedDirectories.length - 1);
}

function getDomainParts(fullUrl) {
    const hostname = new URL(fullUrl).hostname;
    const separatedHostnameParts = hostname.split(".").map((old) => {
        return "d" + old + " ";
    }).join("");
    return separatedHostnameParts.substr(0, separatedHostnameParts.length - 1);
}

function getPathParts(fullUrl) {
    const pathname = new URL(fullUrl).pathname;
    const separatedPathParts = pathname.split("/").map((old) => {
        if (old.length !== 0) {
            return "p" + old + " ";
        } else {
            return "";
        }
    }).join("");
    return separatedPathParts.substr(0, separatedPathParts.length - 1);
}

function generateNewBookmarkData(bookmarkData) {
    const originalPageTitle = bookmarkData.oldTitle.split(separator)[0];
    var titleSuffix = separator + getFolderParts(bookmarkData.parents) + separator +
        getDomainParts(bookmarkData.url) + separator + getPathParts(bookmarkData.url);
    titleSuffix = titleSuffix.split("-").join("");
    var newTitle = originalPageTitle + titleSuffix;
    if(newTitle.indexOf(separator + separator)){
        newTitle = newTitle + newTitle.split(newTitle + newTitle)[1];
    }
    const newBookmarkData = {
        id: bookmarkData.id,
        newTitle: newTitle,
        url: bookmarkData.url
    };

    return newBookmarkData;
}

function crawlParentTitles(parentId, previousParents) {
    if(typeof parentId === 'undefined' || typeof previousParents === 'undefined'){
        previousParents = [];
    }
    return browser.bookmarks.get(parentId).then(function(foundBookmarks) {
        const foundBookmark = foundBookmarks[0];
        const bookmarkTitle = getBookmarkTitle(foundBookmark);
        if(bookmarkTitle !== ''){
            previousParents.push(bookmarkTitle);
        }
        if(typeof foundBookmark.parentId === 'undefined'){
            return Promise.resolve(previousParents.reverse());
        } else {
            return crawlParentTitles(foundBookmark.parentId, previousParents);
        }
    });
}

function findBookmarkFromTree(bookmarkId){
    return browser.bookmarks.getSubTree(bookmarkId);
}

function findBookmarkFromTreeWithItems(bookmarkId, bookmarksToFindIn){
    var foundBookmarkById;
    bookmarksToFindIn.forEach(function(bookmarkToCheck){
        if(bookmarkToCheck.id === bookmarkId){
            foundBookmarkById = bookmarkToCheck;
        } else if(typeof bookmarkToCheck.children !== 'undefined' && typeof foundBookmarkById === 'undefined'){
            foundBookmarkById = findBookmarkFromTreeWithItems(bookmarkId, bookmarkToCheck.children);
        }
    });
    return foundBookmarkById;
}

function fetchAndReprocessBookmark(bookmarkId) {
    if(reverting === false) {
        findBookmarkFromTree(bookmarkId).then(function (foundBookmarks) {
            const foundBookmark = foundBookmarks[0];
            if(foundBookmark.type !== 'folder'){
                crawlParentTitles(foundBookmark.parentId).then(function(parents){
                    const foundBookmark = foundBookmarks[0];
                    foundBookmark.parents = parents;
                    foundBookmark.oldTitle = foundBookmark.title;
                    reprocessBookmark(foundBookmark);
                });
            } else {
                processBookmarksTreeBookmarks(foundBookmarks);
            }
        });
    }
}


function reprocessBookmark(oldBookmarkData) {
    var newBookmarkData = generateNewBookmarkData(oldBookmarkData);
    if(oldBookmarkData.oldTitle !== newBookmarkData.newTitle && !newBookmarkData.newTitle.startsWith(separator)){
        browser.bookmarks.update(newBookmarkData.id, {
            title: newBookmarkData.newTitle
        });
    }
}

function processBookmarksTreeBookmarks(bookmarksTree) {
    var extractedBookmarks = extractBookmarks(bookmarksTree);
    extractedBookmarks.forEach(function (oldBookmarkData) {
        reprocessBookmark(oldBookmarkData);
    });
}

function processAllBookmarks() {
    return browser.bookmarks.getTree().then(function (bookmarksTree) {
        return processBookmarksTreeBookmarks(bookmarksTree);
    });
}

function getBookmarksTreeAsList(bookmarksTree){
    const bookmarksList = [];
    bookmarksTree.forEach(function (bookmark) {
        bookmarksList.push(bookmark);
        if(typeof bookmark.children !== 'undefined'){
            bookmarksList.push.apply(bookmarksList, getBookmarksTreeAsList(bookmark.children));
        }
    });
    return bookmarksList;
}

var reverting = false;

function revertBookmarks(){
    reverting = !reverting;
    if(reverting){
        browser.bookmarks.getTree().then(function (bookmarksTree) {
            var allBookmarksList = getBookmarksTreeAsList(bookmarksTree);
            allBookmarksList.forEach(function (bookmark) {
                browser.bookmarks.update(bookmark.id, {
                    title: bookmark.title.split(separator)[0]
                });
            });
        });
    } else {
        processAllBookmarks();
    }
}

function runInBackground() {
    browser.browserAction.onClicked.addListener(revertBookmarks);

    browser.bookmarks.onCreated.addListener(fetchAndReprocessBookmark);
    browser.bookmarks.onMoved.addListener(fetchAndReprocessBookmark);
    browser.bookmarks.onChanged.addListener(fetchAndReprocessBookmark);

    return browser.runtime.onInstalled.addListener(processAllBookmarks);
}

window.extractBookmarks = extractBookmarks;
window.shouldProcessBookmark = shouldProcessBookmark;
window.generateNewBookmarkData = generateNewBookmarkData;
window.runInBackground = runInBackground;
window.processAllBookmarks = processAllBookmarks;
window.processBookmarksTreeBookmarks = processBookmarksTreeBookmarks;
window.separator = separator;