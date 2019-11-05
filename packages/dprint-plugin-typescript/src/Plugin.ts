import { getFileExtension, ResolveConfigurationResult, resolveConfiguration as resolveGlobalConfiguration, CliLoggingEnvironment } from "@dprint/core";
import { JsPlugin, PrintItemIterable, ConfigurationDiagnostic, PluginInitializeOptions, LoggingEnvironment } from "@dprint/types";
import { TypeScriptConfiguration, ResolvedTypeScriptConfiguration, resolveConfiguration } from "./configuration";
import { parseToBabelAst, parseTypeScriptFile } from "./parsing";

/**
 * Plugin for formatting TypeScript code (.ts/.tsx/.js files).
 */
export class TypeScriptPlugin implements JsPlugin<ResolvedTypeScriptConfiguration> {
    /** @internal */
    private readonly _unresolvedConfig: TypeScriptConfiguration;
    /** @internal */
    private _resolveConfigurationResult?: ResolveConfigurationResult<ResolvedTypeScriptConfiguration>;
    /** @internal */
    private _environment?: LoggingEnvironment;

    /**
     * Constructor.
     * @param config - The configuration to use.
     */
    constructor(config: TypeScriptConfiguration = {}) {
        this._unresolvedConfig = config;
    }

    /** @inheritdoc */
    version = "PACKAGE_VERSION"; // value is replaced at build time

    /** @inheritdoc */
    name = "dprint-plugin-typescript";

    /** @inheritdoc */
    initialize(options: PluginInitializeOptions) {
        this._resolveConfigurationResult = resolveConfiguration(options.globalConfig, this._unresolvedConfig);
        this._environment = options.environment;
    }

    /** @inheritdoc */
    shouldFormatFile(filePath: string) {
        switch (getFileExtension(filePath).toLowerCase()) {
            case ".ts":
            case ".tsx":
            case ".js":
            case ".jsx":
                return true;
            default:
                return false;
        }
    }

    /** @inheritdoc */
    getConfiguration(): ResolvedTypeScriptConfiguration {
        return this._getResolveConfigurationResult().config;
    }

    /** @inheritdoc */
    getConfigurationDiagnostics(): ConfigurationDiagnostic[] {
        return this._getResolveConfigurationResult().diagnostics;
    }

    /** @inheritdoc */
    parseFile(filePath: string, fileText: string): PrintItemIterable | false {
        const babelAst = parseToBabelAst(filePath, fileText);
        return parseTypeScriptFile({
            file: babelAst,
            filePath,
            fileText,
            config: this.getConfiguration(),
            environment: this._getEnvironment()
        });
    }

    /** @internal */
    private _getResolveConfigurationResult() {
        if (this._resolveConfigurationResult == null) {
            const globalConfig = resolveGlobalConfiguration({}).config;
            this._resolveConfigurationResult = resolveConfiguration(globalConfig, this._unresolvedConfig);
        }
        return this._resolveConfigurationResult;
    }

    /** @internal */
    private _getEnvironment() {
        if (this._environment == null)
            this._environment = new CliLoggingEnvironment();
        return this._environment;
    }
}
