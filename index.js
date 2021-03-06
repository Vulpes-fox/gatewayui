// Electron
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const util = require('util');

// Electron Store
const Store = require('electron-store');
const store = new Store({ name: 'saves' });

// Filesystem
const fs = require('fs');

// Electron File Download
const electrondl = require('electron-dl');

// Process
const process = require('process');

// Extension location
const isDev = require('electron-is-dev');
const extension_dirname = !isDev ? `${process.resourcesPath}` : __dirname;

// Prepare Save File
if (store.get('version') == undefined) {
    store.set('version', 0);
}

if (store.get('theme') == undefined) {
    store.set('theme', 'light');
}

if (store.get('medialist') == undefined) {
    store.set('medialist', { uselist: false, bypass_on_retweet: false, bypass_on_like: false, userlist: {} });
}

if (store.get('medialist.bypass_on_retweet') == undefined) {
    store.set('medialist.bypass_on_retweet', false);
}

if (store.get('medialist.bypass_on_like') == undefined) {
    store.set('medialist.bypass_on_like', false);
}

if (store.get('version') == undefined) {
    store.set('version', 0);
}

if (store.get('saves') == undefined) {
    store.set('saves', {
        tweets: {},
        users: {},
    });
}

// Array to object (Updated how the Userlist is stored)
if (util.isArray(store.get('medialist.userlist'))) {
    var users = store.get('medialist.userlist');
    var object = {};
    for (user in users) {
        object[users[user]] = users[user];
    }
    store.delete('medialist.userlist');
    store.set('medialist.userlist', object);
}

// Directory Constants
const savesdir = store.path;
const mediadir = path.join(app.getPath('userData'), 'media');

// Create Mediadir if not exists
if (!fs.existsSync(mediadir)) fs.mkdirSync(mediadir);

const createWindow = () => {

    // Media Download ------------------------------------------------------------------------------------

    ipcMain.on('media', async (event) => {

        dialog.showMessageBox({
            type: "info",
            message: "The download will start",
            detail: "You will see the downloaded files at " + mediadir,
            buttons: ["Open Directory", "Close"],
            cancelId: 1
        }).then((response) => {
            if (response.response == 0) {
                shell.openPath(mediadir);
            }
        });

        var medialist = store.get('medialist');

        var saves = store.get('saves');
        var tweets = saves.tweets;
        var users = saves.users;

        if (tweets === undefined || users === undefined) return;

        for (var tweetkey in tweets) {

            if (!tweets.hasOwnProperty(tweetkey)) continue;
            var this_tweet = tweets[tweetkey];

            if (this_tweet.withheld_scope !== undefined || this_tweet.withheld_copyright !== undefined) continue;

            var this_tweet_id = this_tweet.id_str;
            var this_tweet_author_id = this_tweet.user_id_str;
            var this_tweet_author_username = users[this_tweet_author_id].screen_name;
            if (this_tweet_author_username === undefined) { this_tweet_author_username = 'unknown'; };

            this_tweet_is_retweet = false;
            if (this_tweet.retweeted_status_id_str !== undefined) {
                this_tweet_id = this_tweet.retweeted_status_id_str;
                this_tweet_author_username = /RT @([a-zA-Z0-9_]{1,15}):[\s\S]*/gi.exec(this_tweet.full_text)[1];
                this_tweet_is_retweet = true;
            }

            this_tweet_is_liked = this_tweet.favorited !== undefined ? this_tweet.favorited : false;

            if (medialist.uselist) {
                if ((this_tweet_is_retweet && !medialist.bypass_on_retweet) || (this_tweet_is_liked && !medialist.bypass_on_like) || (!this_tweet_is_retweet && !this_tweet_is_liked)) {
                    if (medialist.userlist[this_tweet_author_username.toLowerCase()] === undefined) continue;
                }
            }

            if (this_tweet.entities.media === undefined) continue;
            var this_tweet_media = this_tweet.entities.media;

            var this_tweet_isvideo_skip = false;

            for (var mediakey in this_tweet_media) {

                if (this_tweet_isvideo_skip) continue;

                var this_tweet_author_dir = path.join(mediadir, this_tweet_author_username);

                if (!fs.existsSync(mediadir)) fs.mkdirSync(mediadir);
                if (!fs.existsSync(this_tweet_author_dir)) fs.mkdirSync(this_tweet_author_dir);

                var this_tweet_media_url = this_tweet_media[mediakey].media_url_https;
                if (this_tweet_media_url === undefined) {
                    this_tweet_media_url = this_tweet_media[mediakey].media_url;
                }

                if (this_tweet.extended_entities.media[0].video_info !== undefined) {

                    var video_info = this_tweet.extended_entities.media[0].video_info;
                    var variant = 0;

                    if (video_info.variants.length > 1) {

                        var biggest_res_variant = { key: 0, res: 0 };

                        for (var variantkey in video_info.variants) {

                            var this_variant = video_info.variants[variantkey];

                            if (this_variant.content_type !== 'video/mp4') continue;

                            var this_variant_res = /\/([0-9]{1,4})x([0-9]{1,4})\//g.exec(this_variant.url)[1];
                            if (this_variant_res === undefined) continue;

                            if (Number(this_variant_res) > biggest_res_variant.res) {
                                biggest_res_variant.key = Number(variantkey);
                                biggest_res_variant.res = Number(this_variant_res);
                            }
                        }
                        variant = biggest_res_variant.key;
                    }

                    this_tweet_media_url = video_info.variants[variant].url;

                    this_tweet_isvideo_skip = true;
                }

                if (this_tweet_media_url === undefined) continue;

                var this_tweet_media_url_pathname = new URL(this_tweet_media_url).pathname;
                var this_tweet_media_name = this_tweet_id + '-' + mediakey + '.' + this_tweet_media_url_pathname.split('.')[this_tweet_media_url_pathname.split('.').length - 1];

                if (fs.existsSync(path.join(this_tweet_author_dir, this_tweet_media_name))) continue;

                try {
                    await electrondl.download(
                        controlWindow,
                        this_tweet_media_url, {
                        directory: this_tweet_author_dir,
                        filename: this_tweet_media_name
                    }
                    );
                } catch (e) {
                    dialog.showMessageBox({
                        type: "error",
                        message: "Download failed!",
                        detail: `The download for the file with id ${this_tweet_id} has failed.`,
                        buttons: ["Close"],
                        cancelId: 0
                    }).then((response) => { });
                }
            }
        }
    });

    // Main Window ---------------------------------------------------------------------------------------

    const mainWindow = new BrowserWindow({
        width: 1100,
        height: 700,

        fullscreenable: false,
        maximizable: false,

        show: false,

        webPreferences: {
            devTools: true,
            nodeIntegration: false,
            enableRemoteModule: false
        }
    });
    mainWindow.loadURL('https://twitter.com');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('close', function () {
        app.quit();
    });

    try {
        mainWindow.webContents.debugger.attach('1.3');
    } catch (err) {
        console.log('Debugger attach failed: ', err);
    }

    mainWindow.webContents.debugger.on('detach', (event, reason) => {
        console.log('Debugger detached due to: ', reason);
    });

    mainWindow.webContents.debugger.on('message', (event, method, params) => {
        if (method === 'Network.responseReceived') {
            //console.log(params.response.url);
            mainWindow.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId }).then(function (response) {
                try {
                    var jsonparsed = JSON.parse(response.body.toString()).data.user.result.timeline.timeline.instructions;
                    var jsonstored = store.get('saves');

                    for (instruction_index in jsonparsed) {
                        var instruction = jsonparsed[instruction_index];
                        if (instruction.type == 'TimelineAddEntries') {
                            
                            var entries = jsonparsed[instruction_index].entries;

                            for (entry_index in entries) {
                                var entry = entries[entry_index].content.itemContent.tweet;

                                var id =  entry.rest_id;
                                var content = entry.legacy;
                                var user_id = entry.core.user.rest_id;
                                var user = entry.core.user.legacy;

                                jsonstored.tweets[id] = content;
                                jsonstored.users[user_id] = user;

                                store.set('saves', jsonstored);
                            }
                            
                        } else {
                            return;
                        }
                    }

                    var vcount = store.get('version');
                    vcount++;
                    store.set('version', vcount);
                } catch (e) {}
            }).catch((error) => {});
        }
    });

    mainWindow.webContents.debugger.sendCommand('Network.enable');

    // Controller Window ---------------------------------------------------------------------------------

    const controlWindow = new BrowserWindow({
        width: 400,
        height: 600,

        titleBarStyle: 'hidden',

        resizable: false,
        fullscreenable: false,
        maximizable: false,

        show: false,

        webPreferences: {
            devTools: false,
            nodeIntegration: true,
            enableRemoteModule: false
        }
    });
    controlWindow.setMenuBarVisibility(false);
    controlWindow.loadFile(path.join(__dirname, 'src/control.html'));

    var mainWindowStartingBounds = mainWindow.getBounds();
    var controlWindowStartingBounds = controlWindow.getBounds();
    controlWindow.setBounds({
        x: (mainWindowStartingBounds.x - controlWindowStartingBounds.width),
        y: mainWindowStartingBounds.y
    });

    controlWindow.once('ready-to-show', () => {
        controlWindow.show();
        controlWindow.webContents.send('update-theme', store.get('theme'));
    });

    controlWindow.on('close', function () {
        app.quit();
    });

    ipcMain.on('open-href', (event, msg) => {

        try {
            var urlobj = new URL(msg);

            if (urlobj.hostname == 'twitter.com' || urlobj.hostname.endsWith('.twitter.com') && urlobj.hostname !== '.twitter.com') {

                mainWindow.loadURL(msg);

            } else {
                dialog.showMessageBox({
                    type: "error",
                    message: "Refused to load this domain",
                    detail: msg,
                    buttons: ["Close"],
                    cancelId: 0
                }).then((response) => { });
            }
        } catch (e) { }
    });

    ipcMain.on('toggle-app-theme', (event, msg) => {
        if (store.get('theme') == 'light') {
            store.set('theme', 'dark');
            controlWindow.webContents.send('update-theme', store.get('theme'));
        } else if (store.get('theme') == 'dark') {
            store.set('theme', 'light');
            controlWindow.webContents.send('update-theme', store.get('theme'));
        }
    });

    var autoscroll = false;
    var autoscrollid = null;
    ipcMain.on('toggle-auto-scroll', (event, msg) => {
        if (!autoscroll) {
            mainWindow.webContents.session.loadExtension(path.join(extension_dirname, 'scrollext')).then(({ id }) => {
                autoscroll = true;
                autoscrollid = id;
                mainWindow.reload();
            });
        } else {
            mainWindow.webContents.session.removeExtension(autoscrollid);
            autoscroll = false;
            autoscrollid = null;
            mainWindow.reload();
        }
    });

    ipcMain.on('get-savesdir', (event) => {
        event.reply('reply-savesdir', savesdir);
    });

    ipcMain.on('get-mediadir', (event) => {
        event.reply('reply-mediadir', mediadir);
    });

    ipcMain.on('get-medialist', (event) => {
        event.reply('reply-medialist', store.get('medialist'));
    });

    ipcMain.on('toggle-uselist', (event) => {
        var now = store.get('medialist.uselist');

        if (now) {
            store.set('medialist.uselist', false);
        } else {
            store.set('medialist.uselist', true);
        }
    });

    ipcMain.on('toggle-bypass_on_retweet', (event) => {
        var now = store.get('medialist.bypass_on_retweet');

        if (now) {
            store.set('medialist.bypass_on_retweet', false);
        } else {
            store.set('medialist.bypass_on_retweet', true);
        }
    });

    ipcMain.on('toggle-bypass_on_like', (event) => {
        var now = store.get('medialist.bypass_on_like');

        if (now) {
            store.set('medialist.bypass_on_like', false);
        } else {
            store.set('medialist.bypass_on_like', true);
        }
    });

    ipcMain.on('add-userlist', (event, msg) => {
        if (msg.length <= 15) {
            var list = store.get('medialist.userlist');
            list[msg.toLowerCase()] = msg;
            store.set('medialist.userlist', list);
        }
    });

    ipcMain.on('remove-userlist', (event, msg) => {
        var list = store.get('medialist.userlist');
        delete list[msg.toLowerCase()];
        store.set('medialist.userlist', list);
    });
};

// Electron App Events -----------------------------------------------------------------------------------

app.on('ready', createWindow);
app.on('window-all-closed', () => { app.quit(); });
app.on('activate', () => { });
