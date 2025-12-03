"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtensionStream = getExtensionStream;
exports.getBuiltInExtensions = getBuiltInExtensions;
const fs = require("fs");
const path = require("path");
const os_1 = require("os");
const rimraf_1 = require("rimraf");
const event_stream_1 = require("event-stream");
const gulp_rename_1 = require("gulp-rename");
const vinyl_fs_1 = require("vinyl-fs");
const ext = require("./extensions");
const fancy_log_1 = require("fancy-log");
const ansi_colors_1 = require("ansi-colors");
const root = path.dirname(path.dirname(__dirname));
const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productjson.builtInExtensions || [];
const webBuiltInExtensions = productjson.webBuiltInExtensions || [];
const controlFilePath = path.join(os_1.default.homedir(), '.vscode-oss-dev', 'extensions', 'control.json');
const ENABLE_LOGGING = !process.env['VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE'];
function log(...messages) {
    if (ENABLE_LOGGING) {
        (0, fancy_log_1.default)(...messages);
    }
}
function getExtensionPath(extension) {
    return path.join(root, '.build', 'builtInExtensions', extension.name);
}
function isUpToDate(extension) {
    const packagePath = path.join(getExtensionPath(extension), 'package.json');
    if (!fs.existsSync(packagePath)) {
        return false;
    }
    const packageContents = fs.readFileSync(packagePath, { encoding: 'utf8' });
    try {
        const diskVersion = JSON.parse(packageContents).version;
        return (diskVersion === extension.version);
    }
    catch (err) {
        return false;
    }
}
function getExtensionDownloadStream(extension) {
    let input;
    if (extension.vsix) {
        input = ext.fromVsix(path.join(root, extension.vsix), extension);
    }
    else if (productjson.extensionsGallery?.serviceUrl) {
        input = ext.fromMarketplace(productjson.extensionsGallery.serviceUrl, extension);
    }
    else {
        input = ext.fromGithub(extension);
    }
    return input.pipe((0, gulp_rename_1.default)(p => p.dirname = `${extension.name}/${p.dirname}`));
}
function getExtensionStream(extension) {
    // if the extension exists on disk, use those files instead of downloading anew
    if (isUpToDate(extension)) {
        log('[extensions]', `${extension.name}@${extension.version} up to date`, ansi_colors_1.default.green('✔︎'));
        return vinyl_fs.src(['**'], { cwd: getExtensionPath(extension), dot: true })
            .pipe((0, gulp_rename_1.default)(p => p.dirname = `${extension.name}/${p.dirname}`));
    }
    return getExtensionDownloadStream(extension);
}
function syncMarketplaceExtension(extension) {
    const galleryServiceUrl = productjson.extensionsGallery?.serviceUrl;
    const source = ansi_colors_1.default.blue(galleryServiceUrl ? '[marketplace]' : '[github]');
    if (isUpToDate(extension)) {
        log(source, `${extension.name}@${extension.version}`, ansi_colors_1.default.green('✔︎'));
        return event_stream_1.default.readArray([]);
    }
    rimraf_1.default.sync(getExtensionPath(extension));
    return getExtensionDownloadStream(extension)
        .pipe(vinyl_fs.dest('.build/builtInExtensions'))
        .on('end', () => log(source, extension.name, ansi_colors_1.default.green('✔︎')));
}
function syncExtension(extension, controlState) {
    if (extension.platforms) {
        const platforms = new Set(extension.platforms);
        if (!platforms.has(process.platform)) {
            log(ansi_colors_1.default.gray('[skip]'), `${extension.name}@${extension.version}: Platform '${process.platform}' not supported: [${extension.platforms}]`, ansi_colors_1.default.green('✔︎'));
            return event_stream_1.default.readArray([]);
        }
    }
    switch (controlState) {
        case 'disabled':
            log(ansi_colors_1.default.blue('[disabled]'), ansi_colors_1.default.gray(extension.name));
            return event_stream_1.default.readArray([]);
        case 'marketplace':
            return syncMarketplaceExtension(extension);
        default:
            if (!fs.existsSync(controlState)) {
                log(ansi_colors_1.default.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but that path does not exist.`));
                return event_stream_1.default.readArray([]);
            }
            else if (!fs.existsSync(path.join(controlState, 'package.json'))) {
                log(ansi_colors_1.default.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but there is no 'package.json' file in that directory.`));
                return event_stream_1.default.readArray([]);
            }
            log(ansi_colors_1.default.blue('[local]'), `${extension.name}: ${ansi_colors_1.default.cyan(controlState)}`, ansi_colors_1.default.green('✔︎'));
            return event_stream_1.default.readArray([]);
    }
}
function readControlFile() {
    try {
        return JSON.parse(fs.readFileSync(controlFilePath, 'utf8'));
    }
    catch (err) {
        return {};
    }
}
function writeControlFile(control) {
    fs.mkdirSync(path.dirname(controlFilePath), { recursive: true });
    fs.writeFileSync(controlFilePath, JSON.stringify(control, null, 2));
}
function getBuiltInExtensions() {
    log('Synchronizing built-in extensions...');
    log(`You can manage built-in extensions with the ${ansi_colors_1.default.cyan('--builtin')} flag`);
    const control = readControlFile();
    const streams = [];
    for (const extension of [...builtInExtensions, ...webBuiltInExtensions]) {
        const controlState = control[extension.name] || 'marketplace';
        control[extension.name] = controlState;
        streams.push(syncExtension(extension, controlState));
    }
    writeControlFile(control);
    return new Promise((resolve, reject) => {
        event_stream_1.default.merge(streams)
            .on('error', reject)
            .on('end', resolve);
    });
}
if (require.main === module) {
    getBuiltInExtensions().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
