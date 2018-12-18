import { packageOf, currentModulePath, patch, findFile } from '@tech_query/node-toolkit';

import { resolve, basename, join, extname } from 'path';

import Git from 'simple-git/promise';

import {
    ensureDirSync, copy, readdirSync, outputJSON, readJSON, existsSync,
    removeSync, moveSync, outputFile, readFile
} from 'fs-extra';

import marked from 'marked';

import 'regenerator-runtime/runtime';

import JSDOM from 'web-cell/dist/polyfill';

import { ArrayView } from 'web-cell';


/**
 * @type {Object}
 */
export  const meta = packageOf( currentModulePath() );


/**
 * @param {String} path
 *
 * @return {String}
 */
export  function packageNameOf(path) {

    return  basename( resolve( path ) ).toLowerCase().replace(/[^@\w]+/g, '-');
}


/**
 * @param {String} path
 *
 * @return {GitRepository}
 */
export  async function bootGit(path) {

    ensureDirSync( path );

    const git = Git( path );

    if (!(await git.checkIsRepo()))  await git.init();

    if ( (await git.getRemotes())[0] )  return;

    const package_name = packageNameOf( path ),
        userID = await git.raw(['config', '--get', 'user.name']);

    await git.addRemote(
        'origin', `https://github.com/${userID}/${package_name}.git`
    );

    return git;
}


/**
 * @param {String} template - Path relative from this package
 * @param {String} dist     - Path relative from `process.cwd()`
 */
export  async function copyFrom(template, dist) {

    template = join(meta.path, template);

    await copy(template,  dist,  {overwrite: false});

    const setting = readdirSync( template )
        .filter(file  =>  extname(file) === '.json');

    for (let file of setting) {

        const source = join(template, file), target = join(dist, file);

        await outputJSON(
            target,
            patch(await readJSON(target),  await readJSON(source)),
            {spaces: 4}
        );
    }
}


/**
 * @param {String} path - Project root
 */
export  async function setRoot(path) {

    await copyFrom('./template', path);

    const ignore_0 = join(path, '.gitignore'),
        ignore_1 = join(path, 'gitignore');

    if (existsSync( ignore_0 ))
        removeSync( ignore_1 );
    else
        moveSync(ignore_1, ignore_0);

    if (! findFile(/ReadMe(\.(md|markdown))?/i, path))
        outputFile(
            join(path, 'ReadMe.md'),
            `# ${packageNameOf( path )}

Static Web site generated by [create-git-web-site](https://web-cell.tk/create-git-web-site/)`
        );

    const { directories } = await readJSON( join(path, 'package.json') );

    ensureDirSync( join(path, directories.doc) );
}


/**
 * @param {String} page - Path of an HTML file
 * @param {String} URI  - CDN base URL
 *
 * @return {JSDOM}
 */
export  async function setCDN(page, URI) {

    page = await JSDOM.fromFile( page );

    const { document, URL } = page.window;

    const resource = document.querySelectorAll(
        'link[rel="stylesheet"], link[rel="icon"], script[src], '  +
        'img[src], audio[src], video[src]'
    );

    for (let element of resource) {

        const key = ('src' in element)  ?  'src'  :  'href';

        element.setAttribute(key,  new URL(element.getAttribute( key ),  URI));
    }

    return page;
}


/**
 * @param {String} path      - Project root
 * @param {String} framework - Web framework
 * @param {String} [CDN]     - CDN base URL
 */
export  async function setHTML(path, framework, CDN) {

    await copy(
        join(meta.path, 'framework', framework),  path,  {overwrite: false}
    );

    if (! CDN)  return;

    const HTML = readdirSync( path ).filter(file => extname(file) === '.html');

    for (let file of HTML) {

        file = join(path, file);

        await outputFile(file,  (await setCDN(file, CDN)).serialize());
    }
}


/**
 * @param {String} file - Path of a MarkDown file
 *
 * @return {Object}
 */
export  async function parseMD(file) {

    const raw = (await readFile( file ))  +  '';

    const line = raw.split( /[\r\n]+/ ).filter( Boolean );

    return {
        name:         basename(file, '.md')  +  '.html',
        title:        line[0].replace(/^#\s*/, ''),
        description:  line[1],
        HTML:         marked( raw )
    };
}


/**
 * @param {String} root - Root path of a Web site
 * @param {String} HTML - Content fragment
 * @param {String} file - HTML file name
 */
export  async function renderArticle(root, HTML, file) {

    const page = await JSDOM.fromFile( join(root, 'article.html') );

    page.window.document.querySelector('article').innerHTML = HTML;

    await outputFile(join(root, 'page', file),  page.serialize());
}


/**
 * @param {String}   template - Path of an `index.html` template
 * @param {String}   selector - CSS selector of an Article list
 * @param {Object[]} data
 * @param {String}   target   - Path of a target `index.html`
 */
export  async function renderList(template, selector, data, target) {

    const {window: { document } } = await JSDOM.fromFile( template );

    const article = document.querySelector( selector );

    (new ArrayView( article )).render( data );

    const page = await JSDOM.fromFile( target );

    page.window.document.querySelector( selector ).replaceWith( article );

    outputFile(target, page.serialize());
}
