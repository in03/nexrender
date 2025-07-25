const fs = require("fs");
const url = require("url");
const path = require("path");
const server = require("./server");
const { lottiePaths, lottieSettings } = require("./defaults");

const createScript = ({ composition, logPath, bodymovinPath, serverUrl, outputPath, lottiePaths, lottieSettings }) => {
    return {
        type: "script",
        src: url.pathToFileURL(path.join(__dirname, "..", "scripts", "lottie-initiator.jsx")).toString(),
        parameters: [
            { type: "string", key: "logPath", value: logPath },
            { type: "string", key: "bodymovinPath", value: bodymovinPath },
            { type: "string", key: "serverUrl", value: serverUrl },
            { type: "array", key: "lottiePaths", value: lottiePaths },
            { type: "object", key: "lottieSettings", value: lottieSettings },
            { type: "string", key: "composition", value: composition },
            { type: "string", key: "outputPath", value: outputPath },
        ],
    };
};

const copy = (srcDir, dstDir) => {
    let results = [];
    const list = fs.readdirSync(srcDir);
    list.forEach(function(file) {
        const src = srcDir + '/' + file;
        const dst = dstDir + '/' + file;
        const stat = fs.statSync(src);

        if (stat && stat.isDirectory()) {
            try {
                fs.mkdirSync(dst);
            } catch(e) {
                console.log('[action-lottie][copy] could\'t create directory: ' + dst + ' ' + e.message);
            }
            results = results.concat(copy(src, dst));
        } else {
            try {
                fs.writeFileSync(dst, fs.readFileSync(src));
            } catch(e) {
                console.log('[action-lottie][copy] could\'t copy file: ' + dst + ' ' + e.message);
            }
            results.push(src);
        }
    });
    return results;
}

module.exports = async (job, settings, { banner = {} }) => {
    settings.logger.log(`[${job.uid}] [action-lottie] starting`);
    const port = await server.start(job, settings);

    job.template.frameStart = 0;
    job.template.frameEnd = 1;

    if (!job.assets) job.assets = [];
    if (!job.actions) job.actions = {};
    if (!job.actions.prerender) job.actions.prerender = [];
    if (!job.actions.postrender) job.actions.postrender = [];

    // copy recursively all files from the lib folder to the job.workpath
    fs.mkdirSync(path.resolve(path.join(job.workpath, "lib")));
    copy(
        path.resolve(path.join(__dirname, "..", "lib")),
        path.resolve(path.join(job.workpath, "lib"))
    );

    // add lottie prerender finish script
    settings.logger.log(`[${job.uid}] [action-lottie] adding lottie prerender finish script`);
    job.actions.postrender.unshift({
        module: path.join(__dirname, "finish.js"),
    });

    // add text-to-image layer script
    settings.logger.log(`[${job.uid}] [action-lottie] adding text-to-image layer script`);
    job.assets.push({
        type: "script",
        src: url.pathToFileURL(path.join(__dirname, "..", "scripts", "text-to-image-layer.jsx")).toString(),
        parameters: [
            { type: "string", key: "composition", value: job.template.composition },
        ],
    });

    const preparedLottieSettings = Object.assign({}, lottieSettings, {
        banner: Object.assign({}, lottieSettings.banner, {
            lottie_origin: banner.lottie_origin || "local",
            lottie_renderer: banner.lottie_renderer || "svg",
            lottie_library: banner.lottie_library || "full",
            use_original_sizes: banner.use_original_sizes === undefined ? true : banner.use_original_sizes,
            width: banner.width === undefined ? 500 : banner.width,
            height: banner.height === undefined ? 500 : banner.height,
            click_tag: banner.click_tag || "#",
            shouldLoop: banner.shouldLoop === undefined ? true : banner.shouldLoop,
            loopCount: banner.loopCount === undefined ? 0 : banner.loopCount,
        }),
    });

    // // ln -s (Footage) folder to the temp workdir
    // fs.symlinkSync(
    //     path.resolve(path.join(__dirname, "..", "scripts", "forward")),
    //     path.resolve(path.join(job.workpath, 'assets')),
    //     'junction'
    // );

    // add lottie initiator script
    settings.logger.log(`[${job.uid}] [action-lottie] adding lottie initiator script`);
    job.assets.push(createScript({
        composition: job.template.composition,
        logPath: path.join(job.workpath, "lottie.log"),
        bodymovinPath: path.join(job.workpath, "lib", "jsx"),
        serverUrl: `localhost:${port}`,
        outputPath: path.join(job.workpath, '--banner--'), // will be placed in the FolderName of the provided path (/uid/banner/)
        lottiePaths,
        lottieSettings: preparedLottieSettings,
    }));

    settings.logger.log(`[${job.uid}] [action-lottie] job preconfigured`);

    return job;
};
