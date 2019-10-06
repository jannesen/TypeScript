namespace ts {
    export function getGetCanonicalFileName(): (fn: string) => string {
        return createGetCanonicalFileName(sys.useCaseSensitiveFileNames);
    }
    export function getReferencedFiles(program: Program, sourceFile: SourceFile, getCanonicalFileName: (fn: string) => string): Map<true> | undefined {
        let referencedFiles: Map<true> | undefined;

        // We need to use a set here since the code can contain the same import twice,
        // but that will only be one dependency.
        // To avoid invernal conversion, the key of the referencedFiles map must be of type Path
        if (sourceFile.imports && sourceFile.imports.length > 0) {
            const checker: TypeChecker = program.getTypeChecker();
            for (const importName of sourceFile.imports) {
                const declarationSourceFilePath = getReferencedFileFromImportLiteral(checker, importName);
                if (declarationSourceFilePath) {
                    addReferencedFile(declarationSourceFilePath);
                }
            }
        }

        const sourceFileDirectory = getDirectoryPath(sourceFile.path);
        // Handle triple slash references
        if (sourceFile.referencedFiles && sourceFile.referencedFiles.length > 0) {
            for (const referencedFile of sourceFile.referencedFiles) {
                const referencedPath = getReferencedFileFromFileName(program, referencedFile.fileName, sourceFileDirectory, getCanonicalFileName);
                addReferencedFile(referencedPath);
            }
        }

        // Handle type reference directives
        if (sourceFile.resolvedTypeReferenceDirectiveNames) {
            sourceFile.resolvedTypeReferenceDirectiveNames.forEach((resolvedTypeReferenceDirective) => {
                if (!resolvedTypeReferenceDirective) {
                    return;
                }

                const fileName = resolvedTypeReferenceDirective.resolvedFileName!; // TODO: GH#18217
                const typeFilePath = getReferencedFileFromFileName(program, fileName, sourceFileDirectory, getCanonicalFileName);
                addReferencedFile(typeFilePath);
            });
        }

        // Add module augmentation as references
        if (sourceFile.moduleAugmentations.length) {
            const checker = program.getTypeChecker();
            for (const moduleName of sourceFile.moduleAugmentations) {
                if (!isStringLiteral(moduleName)) { continue; }
                const symbol = checker.getSymbolAtLocation(moduleName);
                if (!symbol) { continue; }

                // Add any file other than our own as reference
                addReferenceFromAmbientModule(symbol);
            }
        }

        // From ambient modules
        for (const ambientModule of program.getTypeChecker().getAmbientModules()) {
            if (ambientModule.declarations.length > 1) {
                addReferenceFromAmbientModule(ambientModule);
            }
        }

        return referencedFiles;

        function addReferenceFromAmbientModule(symbol: Symbol) {
            // Add any file other than our own as reference
            for (const declaration of symbol.declarations) {
                const declarationSourceFile = getSourceFileOfNode(declaration);
                if (declarationSourceFile &&
                    declarationSourceFile !== sourceFile) {
                    addReferencedFile(declarationSourceFile.resolvedPath);
                }
            }
        }

        function getReferencedFileFromImportLiteral(checker: TypeChecker, importName: StringLiteralLike) {
            const symbol = checker.getSymbolAtLocation(importName);
            return symbol && getReferencedFileFromImportedModuleSymbol(symbol);
        }

        function getReferencedFileFromFileName(program: Program, fileName: string, sourceFileDirectory: Path, getCanonicalFileName: GetCanonicalFileName): Path {
            return toPath(program.getProjectReferenceRedirect(fileName) || fileName, sourceFileDirectory, getCanonicalFileName);
        }

        function getReferencedFileFromImportedModuleSymbol(symbol: Symbol) {
            if (symbol.declarations && symbol.declarations[0]) {
                const declarationSourceFile = getSourceFileOfNode(symbol.declarations[0]);
                return declarationSourceFile && declarationSourceFile.resolvedPath;
            }
        }

        function addReferencedFile(referencedPath: Path) {
            if (!referencedFiles) {
                referencedFiles = createMap<true>();
            }

            referencedFiles.set(referencedPath, true);
        }
    }
}
