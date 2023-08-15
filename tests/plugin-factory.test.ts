/// <reference path="../src/vite-plugin-single-spa.d.ts"/>
import { expect } from 'chai';
import { describe, it } from 'mocha';
import { pluginFactory } from '../src/plugin-factory.js';

import type { SingleSpaRootPluginOptions, SingleSpaMifePluginOptions, ImportMapsOption, ImoUiVariant, ImoUiOption } from "vite-plugin-single-spa";
import type { ConfigEnv, HtmlTagDescriptor, IndexHtmlTransformHook, UserConfig } from 'vite';
import type { PreserveEntrySignaturesOption, OutputOptions } from 'rollup';
import { extensionModuleName } from '../src/ex-defs.js';
import path from 'path';

type ConfigHandler = (this: void, config: UserConfig, env: ConfigEnv) => Promise<UserConfig>
type ResolveIdHandler = (this: void, source: string) => string;
type LoadHandler = (this: void, id: string) => Promise<string>;
type GenerateBundleHandler = (this: void, options: any, bundle: Record<string, any>) => void;

const viteCommands: ConfigEnv['command'][] = [
    'serve',
    'build'
];

const viteModes: ConfigEnv['mode'][] = [
    'development',
    'production'
];

function subSetOf(subset: Record<any, any>, superset: Record<any, any> | undefined) {
    if (!superset) {
        return false;
    }
    for (let [key, value] of Object.entries(subset)) {
        if (value !== superset[key]) {
            return false;
        }
    }
    return true;
}

function searchTag(tags: HtmlTagDescriptor[], tag: string, attrs?: HtmlTagDescriptor['attrs'], predicate?: (t: HtmlTagDescriptor) => boolean) {
    return tags.find(t => t.tag.indexOf(tag) === 0 && (!attrs || subSetOf(attrs, t.attrs)) && (predicate ?? (() => true))(t));
}

function searchForScriptTag(tags: HtmlTagDescriptor[], predicate?: (t: HtmlTagDescriptor) => boolean, attrs?: HtmlTagDescriptor['attrs']) {
    return searchTag(tags, 'script', { type: 'text/javascript', ...(attrs ?? {}) }, predicate);
}

// Plug-in for all tests that don't require mocking.
const vitePluginSingleSpa = pluginFactory();

describe('vite-plugin-single-spa', () => {
    describe('Micro-Frontend Configuration', () => {
        it('Should default to micro-frontend configuration if type is not specified.', async () => {
            // Arrange.
            const options: SingleSpaMifePluginOptions = { serverPort: 4100 };
            const plugIn = vitePluginSingleSpa(options);
            const env: ConfigEnv = { command: 'serve', mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({}, env);

            // Assert.
            expect(config.build).to.not.equal(undefined)
            expect(config.build!.rollupOptions).to.not.equal(undefined);
        });
        const portTest = async (cmd: ConfigEnv['command']) => {
            // Arrange.
            const options: SingleSpaMifePluginOptions = { serverPort: 4111 };
            const plugIn = vitePluginSingleSpa(options);
            const env: ConfigEnv = { command: cmd, mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({}, env);

            // Assert.
            expect(config.server).to.not.equal(undefined);
            expect(config.server!.port).to.equal(options.serverPort);
            expect(config.preview!.port).to.equal(options.serverPort);
        };
        for (let cmd of viteCommands) {
            it(`Should set the server and preview ports equal to the given port number on ${cmd}.`, () => portTest(cmd));
        }
        const inputTest = async (inputProp: string, viteCmd: ConfigEnv['command']) => {
            // Arrange.
            const options: SingleSpaMifePluginOptions = { serverPort: 4111 };
            const plugIn = vitePluginSingleSpa(options);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({}, env);

            // Assert.
            const input = config?.build?.rollupOptions?.input;
            expect(input).to.not.equal(undefined);
            expect(input).to.haveOwnProperty(inputProp);
        };
        it('Should specify the input "spa" on build under the rollup options.', () => inputTest('spa', 'build'));
        it('Should specify the input "index" on serve under the rollup options.', () => inputTest('index', 'serve'));
        const entrySignatureTest = async (viteCmd: ConfigEnv['command'], expectedPropValue: PreserveEntrySignaturesOption) => {
            // Arrange.
            const options: SingleSpaMifePluginOptions = { serverPort: 4111 };
            const plugIn = vitePluginSingleSpa(options);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({}, env);

            // Assert.
            const rollupOpts = config?.build?.rollupOptions;
            expect(rollupOpts).to.not.equal(undefined);
            expect(rollupOpts?.preserveEntrySignatures).to.equal(expectedPropValue);
        };
        it('Should set preserveEntrySignatures to "exports-only" on build under the rollup options.', () => entrySignatureTest('build', 'exports-only'));
        it('Should set preserveEntrySignatures to false on serve under the rollup options.', () => entrySignatureTest('serve', false));
        const fileNamesTest = async (propName: keyof OutputOptions) => {
            // Arrange.
            const options: SingleSpaMifePluginOptions = { serverPort: 4111 };
            const plugIn = vitePluginSingleSpa(options);
            const env: ConfigEnv = { command: 'build', mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({}, env);

            // Assert.
            const outputOpts = config?.build?.rollupOptions?.output;
            expect(outputOpts).to.not.equal(undefined);
            const fileNameSetting = (outputOpts as OutputOptions)[propName];
            expect(fileNameSetting).to.not.match(/\[hash\]/);
        };
        it("Should set the output's asset file names to a hash-less pattern.", () => fileNamesTest('assetFileNames'));
        it("Should set the output's entry file names to a hash-less pattern.", () => fileNamesTest('entryFileNames'));
        const baseTest = async (options: SingleSpaMifePluginOptions, expectedBase: string) => {
            // Arrange.
            const plugIn = vitePluginSingleSpa(options);
            const env: ConfigEnv = { command: 'build', mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({}, env);

            // Assert.
            expect(config.base).to.equal(expectedBase);
        };
        const baseTestData: { config: SingleSpaMifePluginOptions, expectedBase: string }[] = [
            {
                config: { serverPort: 4444 },
                expectedBase: 'http://localhost:4444'
            },
            {
                config: { serverPort: 4444, deployedBase: '/custombase' },
                expectedBase: '/custombase'
            }
        ];
        for (let tc of baseTestData) {
            it(`Should set Vite's base property to "${tc.expectedBase}" when deployedBase is "${tc.config.deployedBase}" on build.`, () => baseTest(tc.config, tc.expectedBase));
        }
        const exModuleIdResolutionTest = async (viteCmd: ConfigEnv['command'], source: string, expectedResult: string | null) => {
            // Arrange.
            const plugIn = vitePluginSingleSpa({ serverPort: 4444 });
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugIn.config as ConfigHandler)({}, env);

            // Act
            const resolvedId = (plugIn.resolveId as ResolveIdHandler)(source);

            // Assert.
            expect(resolvedId).to.equal(expectedResult);
        }
        const exModuleIdResolutionTestData = [
            {
                source: 'abc',
                expectedResult: null,
                text: 'not '
            },
            {
                source: extensionModuleName,
                expectedResult: extensionModuleName,
                text: ''
            },
            {
                source: 'vite-plugin-single-spa',
                expectedResult: null,
                text: 'not '
            }
        ];
        for (let cmd of viteCommands) {
            for (let tc of exModuleIdResolutionTestData) {
                it(`Should ${tc.text}positively identify the module ID "${tc.source}" on ${cmd}.`, () => exModuleIdResolutionTest(cmd, tc.source, tc.expectedResult));
            }
        }
        const exModuleBuildingTest = async (viteCmd: ConfigEnv['command'], moduleId: string, expectedModuleName: string) => {
            // Arrange.
            let expectedModuleRead = false;
            const moduleContent = 'abc - def';
            const readFile = (fileName: string, _opts: any) => {
                const name = path.basename(fileName);
                if (name === expectedModuleName) {
                    expectedModuleRead = true;
                    return Promise.resolve(moduleContent);
                }
                return Promise.resolve('');
            };
            const plugIn = pluginFactory(readFile)({ serverPort: 4444 });
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugIn.config as ConfigHandler)({}, env);

            // Act.
            const moduleCode = await (plugIn.load as LoadHandler)(moduleId);

            // Assert.
            expect(expectedModuleRead).to.equal(true);
            expect(moduleCode).to.contain(moduleContent);
        };
        const exModuleBuildingTestData: { cmd: ConfigEnv['command'], moduleId: string, expectedModuleName: string }[] = [
            {
                cmd: 'build',
                moduleId: extensionModuleName,
                expectedModuleName: 'css.js'
            },
            {
                cmd: 'serve',
                moduleId: extensionModuleName,
                expectedModuleName: 'no-css.js'
            },
            {
                cmd: 'build',
                moduleId: extensionModuleName,
                expectedModuleName: 'vite-env.js'
            },
            {
                cmd: 'serve',
                moduleId: extensionModuleName,
                expectedModuleName: 'vite-env.js'
            }
        ];
        for (let tc of exModuleBuildingTestData) {
            it(`Should include the contents of module "${tc.expectedModuleName}" on ${tc.cmd} while loading module ID "${tc.moduleId}".`, () => exModuleBuildingTest(tc.cmd, tc.moduleId, tc.expectedModuleName));
        }
        const viteEnvValueReplacementTest = async (viteCmd: ConfigEnv['command'], mode: ConfigEnv['mode']) => {
            // Arrange.
            const moduleContent = "'{serving}'\n'{built}'\n{mode}";
            const readFile = (fileName: string, _opts: any) => {
                const name = path.basename(fileName);
                if (name === 'vite-env.js') {
                    return Promise.resolve(moduleContent);
                }
                return Promise.resolve('');
            };
            const plugIn = pluginFactory(readFile)({ serverPort: 4444 });
            const env: ConfigEnv = { command: viteCmd, mode: mode };
            await (plugIn.config as ConfigHandler)({}, env);

            // Act.
            const moduleCode = await (plugIn.load as LoadHandler)(extensionModuleName);

            // Assert.
            expect(moduleCode).to.contain(`${viteCmd === 'serve'}\n${viteCmd === 'build'}\n${mode}`);
        };
        const viteEnvValueReplacementTestData: { cmd: ConfigEnv['command'], mode: ConfigEnv['mode'] }[] = [
            {
                cmd: 'build',
                mode: 'production'
            },
            {
                cmd: 'serve',
                mode: 'development'
            },
            {
                cmd: 'build',
                mode: 'custom'
            },
            {
                cmd: 'serve',
                mode: 'customdev'
            }
        ];
        for (let tc of viteEnvValueReplacementTestData) {
            it(`Should replace the values of "viteEnv" appropriately on ${tc.cmd} with mode "${tc.mode}".`, () => viteEnvValueReplacementTest(tc.cmd, tc.mode));
        }
        const cssFileNamesInsertionTest = async (bundle: Record<string, any>, bundleCodes: Record<string, string>) => {
            // Arrange.
            const plugIn = vitePluginSingleSpa({ serverPort: 4444 });
            const env: ConfigEnv = { command: 'build', mode: 'production' };
            await (plugIn.config as ConfigHandler)({}, env);
            for (let x in bundle) {
                bundle[x].code = bundleCodes[x];
            }

            // Act.
            (plugIn.generateBundle as GenerateBundleHandler)({}, bundle);

            // Assert.
            for (let x in bundle) {
                const entry = bundle[x];
                if (entry.type === 'chunk' && entry.isEntry) {
                    let cssFiles = '';
                    entry.viteMetadata?.importedCss.forEach((css: string) => cssFiles += `,"${css}"`);
                    if (cssFiles.length > 0) {
                        cssFiles = cssFiles.substring(1);
                    }
                expect(entry.code).to.contain(cssFiles);
                }
                else {
                    expect(entry.code).to.equal(bundleCodes[x]);
                }
            }
        };
        const buildSet = (items: string[]) => new Set(items);
        const cssFileNamesInsertionTestData: { bundle: Record<string, any>, bundleCodes: Record<string, string>, text: string }[] = [
            {
                bundle: {
                    'a.js': {
                        type: 'chunk',
                        isEntry: true,
                        viteMetadata: {
                            importedCss: buildSet(['a.css'])
                        }
                    }
                },
                bundleCodes: {
                    'a.js': '"{CSS_FILE_LIST}"'
                },
                text: '1 entry: 1 css'
            },
            {
                bundle: {
                    'a.js': {
                        type: 'chunk',
                        isEntry: true,
                        viteMetadata: {
                            importedCss: buildSet(['a.css', 'b.css'])
                        }
                    }
                },
                bundleCodes: {
                    'a.js': '"{CSS_FILE_LIST}"'
                },
                text: '1 entry: 2 css'
            },
            {
                bundle: {
                    'a.js': {
                        type: 'chunk',
                        isEntry: true,
                        viteMetadata: {
                            importedCss: buildSet(['a.css'])
                        }
                    },
                    'b.js': {
                        type: 'chunk',
                        isEntry: true,
                        viteMetadata: {
                            importedCss: buildSet(['d.css'])
                        }
                    }
                },
                bundleCodes: {
                    'a.js': '"{CSS_FILE_LIST}"',
                    'b.js': '"{CSS_FILE_LIST}"'
                },
                text: '2 entries: 1 css, 1 css'
            },
            {
                bundle: {
                    'a.js': {
                        type: 'chunk',
                        isEntry: true,
                        viteMetadata: {
                            importedCss: buildSet(['a.css'])
                        }
                    },
                    'b.js': {
                        type: 'chunk',
                        isEntry: false
                    }
                },
                bundleCodes: {
                    'a.js': '"{CSS_FILE_LIST}"'
                },
                text: '2 entries: 1 css, N/A'
            },
            {
                bundle: {
                    'a.js': {
                        type: 'chunk',
                        isEntry: true,
                        viteMetadata: {
                            importedCss: buildSet(['a.css'])
                        }
                    },
                    'b.js': {
                        type: 'chunk',
                        isEntry: true,
                        viteMetadata: {
                            importedCss: buildSet(['d.css'])
                        }
                    }
                },
                bundleCodes: {
                    'a.js': '"{CSS_FILE_LIST}"',
                    'b.js': '"{CSS_FILE_LIST}"'
                },
                text: '2 entries: 1 css, 1 css'
            },
        ]
        for (let tc of cssFileNamesInsertionTestData) {
            it(`Should insert the list of CSS bundles of entry chunks: ${tc.text}`, () => cssFileNamesInsertionTest(tc.bundle, tc.bundleCodes));
        }
    });
    describe('Root Configuration', () => {
        const configTest = async (viteCmd: ConfigEnv['command']) => {
            // Assert.
            const options: SingleSpaRootPluginOptions = { type: 'root' };
            const plugIn = vitePluginSingleSpa(options);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };

            // Act.
            const config = await (plugIn.config as ConfigHandler)({}, env);

            // Assert.
            expect(Object.keys(config)).to.have.length(0);
        };
        for (let cmd of viteCommands) {
            it(`Should return no configuration on ${cmd}.`, () => configTest(cmd));
        }
        const noImportMapTest = async (viteCmd: ConfigEnv['command']) => {
            // Arrange.
            const fileExists = (x: string) => false;
            const readFile = (x: string, opts: any) => Promise.reject();
            const plugin = pluginFactory(readFile, fileExists)({ type: 'root' });
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                expect(xForm.tags).to.have.lengthOf(0);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        for (let cmd of viteCommands) {
            it(`Should not include any HTML tags into the HTML page if there is no import map file on ${cmd}.`, () => noImportMapTest(cmd));
        }
        it('Should not pick up the contents of "src/importMap.dev.json" if the file exists on build as the contents of the import map script.', async () => {
            const fileName = 'src/importMap.dev.json';
            const fileExists = (x: string) => x === fileName;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            let fileReadCount = 0;
            const readFile = (x: string, _opts: any) => {
                ++fileReadCount;
                if (x !== fileName) {
                    throw new Error(`File not found: ${x}`);
                }
                return Promise.resolve(JSON.stringify(importMap));
            }
            const plugin = pluginFactory(readFile, fileExists)({ type: 'root' });
            const env: ConfigEnv = { command: 'build', mode: 'production' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(fileReadCount).to.equal(0);
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                expect(xForm.tags).to.have.lengthOf(0);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        });
        const defaultImportMapTest = async (fileName: string, viteCmd: ConfigEnv['command']) => {
            // Arrange.
            const fileExists = (x: string) => x === fileName;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            let fileRead = false;
            let fileReadCount = 0;
            const readFile = (x: string, _opts: any) => {
                if (x === fileName) {
                    fileRead = true;
                }
                ++fileReadCount;
                return Promise.resolve(JSON.stringify(importMap));
            }
            const plugin = pluginFactory(readFile, fileExists)({ type: 'root' });
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(fileRead).to.equal(true);
            expect(fileReadCount).to.equal(1);
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const firstTag = xForm.tags[0];
                expect(firstTag).to.not.equal(undefined);
                expect(firstTag.tag).to.equal('script');
                const parsedImportMap = JSON.parse(firstTag.children as string);
                expect(parsedImportMap).to.be.deep.equal(importMap);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const defaultImportMapTestData: { fileName: string, viteCmd: ConfigEnv['command'] }[] = [
            {
                fileName: 'src/importMap.dev.json',
                viteCmd: 'serve'
            },
            {
                fileName: 'src/importMap.json',
                viteCmd: 'serve'
            },
            {
                fileName: 'src/importMap.json',
                viteCmd: 'build'
            }
        ];
        for (let tc of defaultImportMapTestData) {
            it(`Should pick the contents of the default file "${tc.fileName}" if the file exists on ${tc.viteCmd} as the contents of the import map script.`, () => defaultImportMapTest(tc.fileName, tc.viteCmd));
        }
        const importMapTest = async (propertyName: string, viteCmd: ConfigEnv['command']) => {
            // Arrange.
            const fileName = 'customImportMap.json';
            const fileExists = (x: string) => x === fileName;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            let fileRead = false;
            let fileReadCount = 0;
            const readFile = (x: string, _opts: any) => {
                if (x === fileName) {
                    fileRead = true;
                }
                ++fileReadCount;
                return Promise.resolve(JSON.stringify(importMap));
            }
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', importMaps: {} };
            // @ts-ignore
            pluginOptions.importMaps[propertyName] = fileName;
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(fileRead).to.equal(true);
            expect(fileReadCount).to.equal(1);
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const firstTag = xForm.tags[0];
                expect(firstTag).to.not.equal(undefined);
                expect(firstTag.tag).to.equal('script');
                const parsedImportMap = JSON.parse(firstTag.children as string);
                expect(parsedImportMap).to.be.deep.equal(importMap);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const importMapTestData: { propertyName: string, viteCmd: ConfigEnv['command'] }[] = [
            {
                propertyName: 'dev',
                viteCmd: 'serve'
            },
            {
                propertyName: 'build',
                viteCmd: 'build'
            }
        ];
        for (let tc of importMapTestData) {
            it(`Should pick the contents of the specified file in the "importMaps.${tc.propertyName}" configuration property on ${tc.viteCmd}.`, () => importMapTest(tc.propertyName, tc.viteCmd));
        }
        const importMapTypeTest = async (importMapType: ImportMapsOption['type'], viteCmd: ConfigEnv['command']) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => Promise.resolve(JSON.stringify(importMap));
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', importMaps: {} };
            pluginOptions.importMaps!.type = importMapType;
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const firstTag = xForm.tags[0];
                expect(firstTag).to.not.equal(undefined);
                expect(firstTag.tag).to.equal('script');
                expect(firstTag.attrs).to.not.equal(undefined);
                expect(firstTag.attrs!.type).to.equal(importMapType);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const importMapTypeTestData: ImportMapsOption['type'][] = [
            'importmap',
            'importmap-shim',
            'overridable-importmap',
            'systemjs-importmap'
        ];
        for (let cmd of viteCommands) {
            for (let t of importMapTypeTestData) {
                it(`Should set the import map type in the injected script tag to ${t} on ${cmd}.`, () => importMapTypeTest(t, cmd));
            }
        }
        const defaultImportMapTypeTest = async (viteCmd: ConfigEnv['command']) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => Promise.resolve(JSON.stringify(importMap));
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root' };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imTag = searchTag(xForm.tags, 'script', { type: 'overridable-importmap' })
                const firstTag = xForm.tags[0];
                expect(firstTag).to.not.equal(undefined);
                expect(firstTag.tag).to.equal('script');
                expect(firstTag.attrs).to.not.equal(undefined);
                expect(firstTag.attrs!.type).to.equal('overridable-importmap');
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        for (let cmd of viteCommands) {
            it(`Should set the import map type in the injected script tag to the default type "overridable-importmap" on ${cmd} when no type is specified.`, () => defaultImportMapTypeTest(cmd));
        }
        const postProcessTest = async (viteCmd: ConfigEnv['command']) => {
            const fileExists = (_x: string) => false;
            const readFile = (_x: string, _opts: any) => {
                throw new Error('Not implemented');
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root' };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);

            // Act.
            const order = (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).order;

            // Assert.
            expect(order).to.equal('post');
        };
        for (let cmd of viteCommands) {
            it(`Should run HTML transformation as a post-processing handler on ${cmd}.`, () => postProcessTest(cmd));
        }
        const imoOnImportMapTest = async (viteCmd: ConfigEnv['command']) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => Promise.resolve(JSON.stringify(importMap));
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root' };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes('import-map-overrides@latest'));
                expect(imoTag).to.not.equal(undefined);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        }
        for (let cmd of viteCommands) {
            it(`Should include a script tag for "import-map-overrides" if there are import maps and the "imo" configuration property is not specified on ${cmd}.`, () => imoOnImportMapTest(cmd));
        }
        const imoVersionTest = async (viteCmd: ConfigEnv['command']) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => Promise.resolve(JSON.stringify(importMap));
            const imoVersion = '2.4.2'
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imo: imoVersion };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes(`import-map-overrides@${imoVersion}`));
                expect(imoTag).to.not.equal(undefined);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        }
        for (let cmd of viteCommands) {
            it(`Should include a script tag for "import-map-overrides" using the version specified in the "imo" configuration property on ${cmd}.`, () => imoVersionTest(cmd));
        }
        const imoFunctionTest = async (viteCmd: ConfigEnv['command']) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => Promise.resolve(JSON.stringify(importMap));
            const imoUrl = 'https://cdn.example.com/import-map-overrides@3.0.1';
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imo: () => imoUrl };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoTag = searchForScriptTag(xForm.tags, undefined, { src: imoUrl });
                expect(imoTag).to.not.equal(undefined);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        }
        for (let cmd of viteCommands) {
            it(`Should include a script tag for "import-map-overrides" using the the URL returned by the function in the "imo" configuration property on ${cmd}.`, () => imoFunctionTest(cmd));
        }
        const imoBooleanTest = async (viteCmd: ConfigEnv['command'], imoValue: boolean) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => Promise.resolve(JSON.stringify(importMap));
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imo: imoValue };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoTag = searchForScriptTag(xForm.tags, t => ((t.attrs!.src as string) ?? '').includes('import-map-overrides@latest'));
                if (imoValue) {
                    expect(imoTag).to.not.equal(undefined);
                }
                else {
                    expect(imoTag).to.equal(undefined);
                }
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        }
        const imoBooleanTestData = [
            {
                includesOrNot: 'not ',
                imoValue: false
            },
            {
                includesOrNot: '',
                imoValue: true
            }
        ];
        for (let tc of imoBooleanTestData) {
            for (let cmd of viteCommands) {
                it(`Should ${tc.includesOrNot}include the "import-map-overrides" tag if the "imo" configuration property is set to "${tc.imoValue}" on ${cmd}.`, () => imoBooleanTest(cmd, tc.imoValue));
            }
        }
        const noImoOnNoImportMapTest = async (viteCmd: ConfigEnv['command'], imoValue: SingleSpaRootPluginOptions['imo']) => {
            const fileExists = (_x: string) => false;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => {
                throw new Error('Not implemented.');
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imo: imoValue };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoTag = searchForScriptTag(xForm.tags, t =>
                    typeof imoValue === 'function' ?
                        (t.attrs!.src as string) === imoValue()
                        : (typeof imoValue === 'string' ?
                            ((t.attrs!.src as string) ?? '').includes(`import-map-overrides@${imoValue}`) :
                            ((t.attrs!.src as string) ?? '').includes('import-map-overrides@latest')));
                expect(imoTag).to.equal(undefined);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const noImoOnNoImportMapTestData: { imoValue: SingleSpaRootPluginOptions['imo'], valueDesc: string }[] = [
            {
                imoValue: true,
                valueDesc: 'true'
            },
            {
                imoValue: '2.4.2',
                valueDesc: 'a version number'
            },
            {
                imoValue: () => 'http://cdn.example.com/import-map-overrides@3.0.1',
                valueDesc: 'a function'
            }
        ];
        for (let tc of noImoOnNoImportMapTestData) {
            for (let cmd of viteCommands) {
                it(`Should not include "import-map-overrides" if no import map is available on ${cmd}, even if "imo" is set to ${tc.valueDesc} on ${cmd}.`, () => noImoOnNoImportMapTest(cmd, tc.imoValue));
            }
        }
        const imoUiTest = async (viteCmd: ConfigEnv['command'], imoUiValue: SingleSpaRootPluginOptions['imoUi'], expectedToExist: boolean) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => {
                throw new Error('Not implemented.');
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imoUi: imoUiValue };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoTag = searchTag(xForm.tags, 'import-map-overrides-');
                const assertFn = expectedToExist ? () => expect(imoTag).to.not.equal(undefined) : () => expect(imoTag).to.equal(undefined);
                assertFn();
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const imoUiDefaultsTest = async (viteCmd: ConfigEnv['command'], importMapExists: boolean) => {
            const fileExists = (_x: string) => importMapExists;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => {
                return Promise.resolve(JSON.stringify(importMap));
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root' };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoUiTag = searchTag(xForm.tags, 'import-map-overrides-full');
                const assertFn = importMapExists ? () => expect(imoUiTag).to.not.equal(undefined) : () => expect(imoUiTag).to.equal(undefined);
                assertFn();
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const imoUiDefaultsTestData = [
            {
                importMap: false,
                text1: 'not ',
                text2: 'no '
            },
            {
                importMap: true,
                text1: '',
                text2: ''
            }
        ]
        for (let cmd of viteCommands) {
            for (let tc of imoUiDefaultsTestData) {
                it(`Should ${tc.text1}inlcude the "import-map-overrides" UI element when the "imoUi" property is not explicitly set on ${cmd} and there are ${tc.text2}import maps.`, () => imoUiDefaultsTest(cmd, tc.importMap));
            }
        }
        const imoUiIncludeTest = async (viteCmd: ConfigEnv['command'], imoUiOption: ImoUiVariant, variantName: string, expectToExist: boolean) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => {
                return Promise.resolve(JSON.stringify(importMap));
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imoUi: imoUiOption };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoUiTag = searchTag(xForm.tags, `import-map-overrides-${variantName}`);
                const assertFn = expectToExist ? () => expect(imoUiTag).to.not.equal(undefined) : () => expect(imoUiTag).to.equal(undefined);
                assertFn();
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const imoUiIncludeTestData: { imoUiOption: ImoUiVariant, variantName: string }[] = [
            {
                imoUiOption: true,
                variantName: 'full'
            }
        ];
        for (let cmd of viteCommands) {
            for (let tc of imoUiIncludeTestData) {
                it(`Should include the "import-map-overrides-${tc.variantName}" UI element when the "imoUi" property is set to ${tc.imoUiOption} on ${cmd}.`, () => imoUiIncludeTest(cmd, tc.imoUiOption, tc.variantName, true));
            }
        }
        for (let cmd of viteCommands) {
            it(`Should not include the "import-map-overrides" UI element when the "imoUi" property is set to false on ${cmd}.`, () => imoUiIncludeTest(cmd, false, '', false));
        }
        const imoUiNoAttrsTest = async (viteCmd: ConfigEnv['command'], imoUiOption: ImoUiVariant) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => {
                return Promise.resolve(JSON.stringify(importMap));
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imoUi: imoUiOption };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoUiTag = searchTag(xForm.tags, `import-map-overrides-${imoUiOption}`);
                expect(imoUiTag).to.not.equal(undefined);
                expect(Object.keys(imoUiTag?.attrs ?? {})).to.have.lengthOf(0);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const imoUiNoAttrsTestData: ImoUiVariant[] = [
            'list',
            'popup'
        ];
        for (let cmd of viteCommands) {
            for (let tc of imoUiNoAttrsTestData) {
                it(`Should not include any attributes in the "import-map-overrides" UI element when the UI variant is ${tc} on ${cmd}.`, () => imoUiNoAttrsTest(cmd, tc));
            }
        }
        const imoUiAttrsTest = async (viteCmd: ConfigEnv['command']) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => {
                return Promise.resolve(JSON.stringify(importMap));
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imoUi: 'full' };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoUiTag = searchTag(xForm.tags, 'import-map-overrides-full');
                expect(imoUiTag).to.not.equal(undefined);
                expect(imoUiTag!.attrs!['trigger-position']).to.equal('bottom-right');
                expect(imoUiTag!.attrs!['show-when-local-storage']).to.equal('imo-ui');
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        for (let cmd of viteCommands) {
            it(`Should include the "trigger-position" and "show-when-local-storage" attributes in the "import-map-overrides-full" UI element with the defaults "bottom-right" and "imo-ui" on ${cmd}.`, () => imoUiAttrsTest(cmd));
        }
        const imoUiTriggerPosTest = async (viteCmd: ConfigEnv['command'], buttonPos: ImoUiOption['buttonPos']) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => {
                return Promise.resolve(JSON.stringify(importMap));
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imoUi: { buttonPos } };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoUiTag = searchTag(xForm.tags, 'import-map-overrides-full');
                expect(imoUiTag).to.not.equal(undefined);
                expect(imoUiTag!.attrs!['trigger-position']).to.equal(buttonPos);
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        };
        const imoUiTriggerPosTestData: ImoUiOption['buttonPos'][] = [
            'bottom-left',
            'bottom-right',
            'top-left',
            'top-right'
        ];
        for (let cmd of viteCommands) {
            for (let tc of imoUiTriggerPosTestData) {
                it(`Should set the "trigger-position" attribute value to ${tc} when the "imoUi.buttonPos" property is set to ${tc} on ${cmd}.`, () => imoUiTriggerPosTest(cmd, tc));
            }
        }
        const imoUiLsKeyTest = async (viteCmd: ConfigEnv['command']) => {
            const fileExists = (_x: string) => true;
            const importMap = {
                imports: {
                    '@a/b': 'cd'
                },
                scopes: {
                    pickyModule: {
                        '@a/b': 'ef'
                    }
                }
            };
            const readFile = (_x: string, _opts: any) => {
                return Promise.resolve(JSON.stringify(importMap));
            };
            const pluginOptions: SingleSpaRootPluginOptions = { type: 'root', imoUi: { localStorageKey: 'customLsValue' } };
            const plugin = pluginFactory(readFile, fileExists)(pluginOptions);
            const env: ConfigEnv = { command: viteCmd, mode: 'development' };
            await (plugin.config as ConfigHandler)({}, env);
            const ctx = { path: '', filename: '' };

            // Act.
            const xForm = await (plugin.transformIndexHtml as { order: any, handler: IndexHtmlTransformHook }).handler('', ctx);

            // Assert.
            expect(xForm).to.not.equal(null);
            expect(xForm).to.not.equal(undefined);
            if (xForm && typeof xForm !== 'string' && !Array.isArray(xForm)) {
                const imoUiTag = searchTag(xForm.tags, 'import-map-overrides-full');
                expect(imoUiTag).to.not.equal(undefined);
                expect(imoUiTag!.attrs!['show-when-local-storage']).to.equal('customLsValue');
            }
            else {
                throw new Error('TypeScript narrowing suddenly routed the test elsewhere!');
            }
        }
        for (let cmd of viteCommands) {
            it(`Should set the "show-when-local-storage" attribute value to "customLsValue" when the "imoUi.localStorageKey" property is set to "customLsValue" on ${cmd}.`, () => imoUiLsKeyTest(cmd));
        }
    });
});
