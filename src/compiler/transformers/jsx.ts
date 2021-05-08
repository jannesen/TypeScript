/*@internal*/
namespace ts {
    export function transformJsx(context: TransformationContext) {
        return chainBundle(context, transformSourceFile);

        /**
         * Transform JSX-specific syntax in a SourceFile.
         *
         * @param node A SourceFile node.
         */
        function transformSourceFile(node: SourceFile) {
            if (node.isDeclarationFile) {
                return node;
            }

            return sourceFileTransformer(node, context);
        }
    }

    function sourceFileTransformer(currentSourceFile: SourceFile, context: TransformationContext) {
        interface PerFileState {
            importSpecifier?: string;
            filenameDeclaration?: VariableDeclaration & { name: Identifier; };
            utilizedImplicitRuntimeImports?: Map<Map<ImportSpecifier>>;
        }

        const { factory, getEmitHelperFactory: emitHelpers } = context;
        const compilerOptions = context.getCompilerOptions();
        const currentFileState: PerFileState = { importSpecifier: getJSXImplicitImportBase(compilerOptions, currentSourceFile) };

        return transformSourceFile();

        function getCurrentFileNameExpression(): Identifier {
            if (currentFileState.filenameDeclaration) {
                return currentFileState.filenameDeclaration.name;
            }
            const declaration = factory.createVariableDeclaration(factory.createUniqueName("_jsxFileName", GeneratedIdentifierFlags.Optimistic | GeneratedIdentifierFlags.FileLevel), /*exclaimationToken*/ undefined, /*type*/ undefined, factory.createStringLiteral(currentSourceFile.fileName));
            currentFileState.filenameDeclaration = declaration as VariableDeclaration & { name: Identifier };
            return currentFileState.filenameDeclaration.name;
        }

        function getJsxFactoryCalleePrimitive(childrenLength: number): "jsx" | "jsxs" | "jsxDEV" {
            return compilerOptions.jsx === JsxEmit.ReactJSXDev ? "jsxDEV" : childrenLength > 1 ? "jsxs" : "jsx";
        }

        function getJsxFactoryCallee(childrenLength: number) {
            const type = getJsxFactoryCalleePrimitive(childrenLength);
            return getImplicitImportForName(type);
        }

        function getImplicitJsxFragmentReference() {
            return getImplicitImportForName("Fragment");
        }

        function getImplicitImportForName(name: string) {
            const importSource = name === "createElement"
                ? currentFileState.importSpecifier!
                : getJSXRuntimeImport(currentFileState.importSpecifier, compilerOptions)!;
            const existing = currentFileState.utilizedImplicitRuntimeImports?.get(importSource)?.get(name);
            if (existing) {
                return existing.name;
            }
            if (!currentFileState.utilizedImplicitRuntimeImports) {
                currentFileState.utilizedImplicitRuntimeImports = createMap();
            }
            let specifierSourceImports = currentFileState.utilizedImplicitRuntimeImports.get(importSource);
            if (!specifierSourceImports) {
                specifierSourceImports = createMap();
                currentFileState.utilizedImplicitRuntimeImports.set(importSource, specifierSourceImports);
            }
            const generatedName = factory.createUniqueName(`_${name}`, GeneratedIdentifierFlags.Optimistic | GeneratedIdentifierFlags.FileLevel | GeneratedIdentifierFlags.AllowNameSubstitution);
            const specifier = factory.createImportSpecifier(factory.createIdentifier(name), generatedName);
            generatedName.generatedImportReference = specifier;
            specifierSourceImports.set(name, specifier);
            return generatedName;
        }

        /**
         * Transform JSX-specific syntax in a SourceFile.
         *
         * @param node A SourceFile node.
         */
        function transformSourceFile() {
            let visited = visitEachChild(currentSourceFile, visitor, context);
            addEmitHelpers(visited, context.readEmitHelpers());
            let statements: readonly Statement[] = visited.statements;
            if (currentFileState.filenameDeclaration) {
                statements = insertStatementAfterCustomPrologue(statements.slice(), factory.createVariableStatement(/*modifiers*/ undefined, factory.createVariableDeclarationList([currentFileState.filenameDeclaration], NodeFlags.Const)));
            }
            if (currentFileState.utilizedImplicitRuntimeImports) {
                for (const [importSource, importSpecifiersMap] of arrayFrom(currentFileState.utilizedImplicitRuntimeImports.entries())) {
                    if (isExternalModule(currentSourceFile)) {
                        // Add `import` statement
                        const importStatement = factory.createImportDeclaration(/*decorators*/ undefined, /*modifiers*/ undefined, factory.createImportClause(/*typeOnly*/ false, /*name*/ undefined, factory.createNamedImports(arrayFrom(importSpecifiersMap.values()))), factory.createStringLiteral(importSource));
                        setParentRecursive(importStatement, /*incremental*/ false);
                        statements = insertStatementAfterCustomPrologue(statements.slice(), importStatement);
                    }
                    else if (isExternalOrCommonJsModule(currentSourceFile)) {
                        // Add `require` statement
                        const requireStatement = factory.createVariableStatement(/*modifiers*/ undefined, factory.createVariableDeclarationList([
                            factory.createVariableDeclaration(
                                factory.createObjectBindingPattern(map(arrayFrom(importSpecifiersMap.values()), s => factory.createBindingElement(/*dotdotdot*/ undefined, s.propertyName, s.name))),
                                /*exclaimationToken*/ undefined,
                                /*type*/ undefined,
                                factory.createCallExpression(factory.createIdentifier("require"), /*typeArguments*/ undefined, [factory.createStringLiteral(importSource)])
                            )
                        ], NodeFlags.Const));
                        setParentRecursive(requireStatement, /*incremental*/ false);
                        statements = insertStatementAfterCustomPrologue(statements.slice(), requireStatement);
                    }
                    else {
                        // Do nothing (script file) - consider an error in the checker?
                    }
                }
            }
            if (statements !== visited.statements) {
                visited = factory.updateSourceFile(visited, statements);
            }

            return visited;
        }

        function visitor(node: Node): VisitResult<Node> {
            if (node.transformFlags & TransformFlags.ContainsJsx) {
                return visitorWorker(node);
            }
            else {
                return node;
            }
        }

        function visitorWorker(node: Node): VisitResult<Node> {
            switch (node.kind) {
                case SyntaxKind.JsxElement:
                    return visitJsxElement(<JsxElement>node, /*isChild*/ false);

                case SyntaxKind.JsxSelfClosingElement:
                    return visitJsxSelfClosingElement(<JsxSelfClosingElement>node, /*isChild*/ false);

                case SyntaxKind.JsxFragment:
                    return visitJsxFragment(<JsxFragment>node, /*isChild*/ false);

                case SyntaxKind.JsxExpression:
                    return visitJsxExpression(<JsxExpression>node);

                default:
                    return visitEachChild(node, visitor, context);
            }
        }

        function transformJsxChildToExpression(node: JsxChild): Expression | undefined {
            switch (node.kind) {
                case SyntaxKind.JsxText:
                    return visitJsxText(node);

                case SyntaxKind.JsxExpression:
                    return visitJsxExpression(node);

                case SyntaxKind.JsxElement:
                    return visitJsxElement(node, /*isChild*/ true);

                case SyntaxKind.JsxSelfClosingElement:
                    return visitJsxSelfClosingElement(node, /*isChild*/ true);

                case SyntaxKind.JsxFragment:
                    return visitJsxFragment(node, /*isChild*/ true);

                default:
                    return Debug.failBadSyntaxKind(node);
            }
        }

        /**
         * The react jsx/jsxs transform falls back to `createElement` when an explicit `key` argument comes after a spread
         */
        function hasKeyAfterPropsSpread(node: JsxOpeningLikeElement) {
            let spread = false;
            for (const elem of node.attributes.properties) {
                if (isJsxSpreadAttribute(elem)) {
                    spread = true;
                }
                else if (spread && isJsxAttribute(elem) && elem.name.escapedText === "key") {
                    return true;
                }
            }
            return false;
        }

        function shouldUseCreateElement(node: JsxOpeningLikeElement) {
            return currentFileState.importSpecifier === undefined || hasKeyAfterPropsSpread(node);
        }

        function visitJsxElement(node: JsxElement, isChild: boolean) {
            const tagTransform = shouldUseCreateElement(node.openingElement) ? visitJsxOpeningLikeElementCreateElement : visitJsxOpeningLikeElementJSX;
            return tagTransform(node.openingElement, node.children, isChild, /*location*/ node);
        }

        function visitJsxSelfClosingElement(node: JsxSelfClosingElement, isChild: boolean) {
            const tagTransform = shouldUseCreateElement(node) ? visitJsxOpeningLikeElementCreateElement : visitJsxOpeningLikeElementJSX;
            return tagTransform(node, /*children*/ undefined, isChild, /*location*/ node);
        }

        function visitJsxFragment(node: JsxFragment, isChild: boolean) {
            const tagTransform = currentFileState.importSpecifier === undefined ? visitJsxOpeningFragmentCreateElement : visitJsxOpeningFragmentJSX;
            return tagTransform(node.openingFragment, node.children, isChild, /*location*/ node);
        }

        function convertJsxChildrenToChildrenPropObject(children: readonly JsxChild[]) {
            const nonWhitespaceChildren = getSemanticJsxChildren(children);
            if (length(nonWhitespaceChildren) === 1) {
                const result = transformJsxChildToExpression(nonWhitespaceChildren[0]);
                return result && factory.createObjectLiteralExpression([
                    factory.createPropertyAssignment("children", result)
                ]);
            }
            const result = mapDefined(children, transformJsxChildToExpression);
            return !result.length ? undefined : factory.createObjectLiteralExpression([
                factory.createPropertyAssignment("children", factory.createArrayLiteralExpression(result))
            ]);
        }

        function visitJsxOpeningLikeElementJSX(node: JsxOpeningLikeElement, children: readonly JsxChild[] | undefined, isChild: boolean, location: TextRange) {
            const tagName = getTagName(node);
            let objectProperties: Expression;
            const keyAttr = find(node.attributes.properties, p => !!p.name && isIdentifier(p.name) && p.name.escapedText === "key") as JsxAttribute | undefined;
            const attrs = keyAttr ? filter(node.attributes.properties, p => p !== keyAttr) : node.attributes.properties;

            let segments: Expression[] = [];
            if (attrs.length) {
                // Map spans of JsxAttribute nodes into object literals and spans
                // of JsxSpreadAttribute nodes into expressions.
                segments = flatten(
                    spanMap(attrs, isJsxSpreadAttribute, (attrs, isSpread) => isSpread
                        ? map(attrs, transformJsxSpreadAttributeToExpression)
                        : factory.createObjectLiteralExpression(map(attrs, transformJsxAttributeToObjectLiteralElement))
                    )
                );

                if (isJsxSpreadAttribute(attrs[0])) {
                    // We must always emit at least one object literal before a spread
                    // argument.factory.createObjectLiteral
                    segments.unshift(factory.createObjectLiteralExpression());
                }
            }
            if (children && children.length) {
                const result = convertJsxChildrenToChildrenPropObject(children);
                if (result) {
                    segments.push(result);
                }
            }

            if (segments.length === 0) {
                objectProperties = factory.createObjectLiteralExpression([]);
                // When there are no attributes, React wants {}
            }
            else {
                // Either emit one big object literal (no spread attribs), or
                // a call to the __assign helper.
                objectProperties = singleOrUndefined(segments) || emitHelpers().createAssignHelper(segments);
            }

            return visitJsxOpeningLikeElementOrFragmentJSX(tagName, objectProperties, keyAttr, length(getSemanticJsxChildren(children || emptyArray)), isChild, location);
        }

        function visitJsxOpeningLikeElementOrFragmentJSX(tagName: Expression, objectProperties: Expression, keyAttr: JsxAttribute | undefined, childrenLength: number, isChild: boolean, location: TextRange) {
            const args: Expression[] = [tagName, objectProperties, !keyAttr ? factory.createVoidZero() : transformJsxAttributeInitializer(keyAttr.initializer)];
            if (compilerOptions.jsx === JsxEmit.ReactJSXDev) {
                const originalFile = getOriginalNode(currentSourceFile);
                if (originalFile && isSourceFile(originalFile)) {
                    // isStaticChildren development flag
                    args.push(childrenLength > 1 ? factory.createTrue() : factory.createFalse());
                    // __source development flag
                    const lineCol = getLineAndCharacterOfPosition(originalFile, location.pos);
                    args.push(factory.createObjectLiteralExpression([
                        factory.createPropertyAssignment("fileName", getCurrentFileNameExpression()),
                        factory.createPropertyAssignment("lineNumber", factory.createNumericLiteral(lineCol.line + 1)),
                        factory.createPropertyAssignment("columnNumber", factory.createNumericLiteral(lineCol.character + 1))
                    ]));
                    // __self development flag
                    args.push(factory.createThis());
                }
            }
            const element = setTextRange(factory.createCallExpression(getJsxFactoryCallee(childrenLength), /*typeArguments*/ undefined, args), location);

            if (isChild) {
                startOnNewLine(element);
            }

            return element;
        }

        function visitJsxOpeningLikeElementCreateElement(node: JsxOpeningLikeElement, children: readonly JsxChild[] | undefined, isChild: boolean, location: TextRange) {
            const tagName = getTagName(node);
            let objectProperties: Expression | undefined;
            const attrs = node.attributes.properties;
            if (attrs.length === 0) {
                objectProperties = factory.createNull();
                // When there are no attributes, React wants "null"
            }
            else {
                const target = compilerOptions.target;
                if (target && target >= ScriptTarget.ES2018) {
                    objectProperties = factory.createObjectLiteralExpression(
                        flatten<SpreadAssignment | PropertyAssignment>(
                            spanMap(attrs, isJsxSpreadAttribute, (attrs, isSpread) =>
                                isSpread ? map(attrs, transformJsxSpreadAttributeToSpreadAssignment) : map(attrs, transformJsxAttributeToObjectLiteralElement)
                            )
                        )
                    );
                }
                else {
                    // Map spans of JsxAttribute nodes into object literals and spans
                    // of JsxSpreadAttribute nodes into expressions.
                    const segments = flatten<Expression | ObjectLiteralExpression>(
                        spanMap(attrs, isJsxSpreadAttribute, (attrs, isSpread) => isSpread
                            ? map(attrs, transformJsxSpreadAttributeToExpression)
                            : factory.createObjectLiteralExpression(map(attrs, transformJsxAttributeToObjectLiteralElement))
                        )
                    );

                    if (isJsxSpreadAttribute(attrs[0])) {
                        // We must always emit at least one object literal before a spread
                        // argument.factory.createObjectLiteral
                        segments.unshift(factory.createObjectLiteralExpression());
                    }

                    // Either emit one big object literal (no spread attribs), or
                    // a call to the __assign helper.
                    objectProperties = singleOrUndefined(segments);
                    if (!objectProperties) {
                        objectProperties = emitHelpers().createAssignHelper(segments);
                    }
                }
            }

            const callee = currentFileState.importSpecifier === undefined
                ? createJsxFactoryExpression(
                    factory,
                    context.getEmitResolver().getJsxFactoryEntity(currentSourceFile),
                    compilerOptions.reactNamespace!, // TODO: GH#18217
                    node
                )
                : getImplicitImportForName("createElement");

            const element = createExpressionForJsxElement(
                factory,
                callee,
                tagName,
                objectProperties,
                mapDefined(children, transformJsxChildToExpression),
                location
            );

            if (isChild) {
                startOnNewLine(element);
            }

            return element;
        }

        function visitJsxOpeningFragmentJSX(_node: JsxOpeningFragment, children: readonly JsxChild[], isChild: boolean, location: TextRange) {
            let childrenProps: Expression | undefined;
            if (children && children.length) {
                const result = convertJsxChildrenToChildrenPropObject(children);
                if (result) {
                    childrenProps = result;
                }
            }
            return visitJsxOpeningLikeElementOrFragmentJSX(
                getImplicitJsxFragmentReference(),
                childrenProps || factory.createObjectLiteralExpression([]),
                /*keyAttr*/ undefined,
                length(getSemanticJsxChildren(children)),
                isChild,
                location
            );
        }

        function visitJsxOpeningFragmentCreateElement(node: JsxOpeningFragment, children: readonly JsxChild[], isChild: boolean, location: TextRange) {
            const element = createExpressionForJsxFragment(
                factory,
                context.getEmitResolver().getJsxFactoryEntity(currentSourceFile),
                context.getEmitResolver().getJsxFragmentFactoryEntity(currentSourceFile),
                compilerOptions.reactNamespace!, // TODO: GH#18217
                mapDefined(children, transformJsxChildToExpression),
                node,
                location
            );

            if (isChild) {
                startOnNewLine(element);
            }

            return element;
        }

        function transformJsxSpreadAttributeToSpreadAssignment(node: JsxSpreadAttribute) {
            return factory.createSpreadAssignment(visitNode(node.expression, visitor, isExpression));
        }

        function transformJsxSpreadAttributeToExpression(node: JsxSpreadAttribute) {
            return visitNode(node.expression, visitor, isExpression);
        }

        function transformJsxAttributeToObjectLiteralElement(node: JsxAttribute) {
            const name = jsxutil.getAttributeName(node);
            const expression = transformJsxAttributeInitializer(node.initializer);
            return factory.createPropertyAssignment(name, expression);
        }

        function transformJsxAttributeInitializer(node: StringLiteral | JsxExpression | undefined): Expression {
            if (node === undefined) {
                return factory.createTrue();
            }
            else if (node.kind === SyntaxKind.StringLiteral) {
                // Always recreate the literal to escape any escape sequences or newlines which may be in the original jsx string and which
                // Need to be escaped to be handled correctly in a normal string
                const singleQuote = node.singleQuote !== undefined ? node.singleQuote : !isStringDoubleQuoted(node, currentSourceFile);
                const literal = factory.createStringLiteral(jsxutil.tryDecodeEntities(node.text) || node.text, singleQuote);
                return setTextRange(literal, node);
            }
            else if (node.kind === SyntaxKind.JsxExpression) {
                if (node.expression === undefined) {
                    return factory.createTrue();
                }
                return visitNode(node.expression, visitor, isExpression);
            }
            else {
                return Debug.failBadSyntaxKind(node);
            }
        }

        function visitJsxText(node: JsxText): StringLiteral | undefined {
            const fixed = jsxutil.fixupWhitespaceAndDecodeEntities(node.text);
            return fixed === undefined ? undefined : factory.createStringLiteral(fixed);
        }

        function getTagName(node: JsxElement | JsxOpeningLikeElement): Expression {
            if (node.kind === SyntaxKind.JsxElement) {
                return getTagName(node.openingElement);
            }
            else {
                const name = node.tagName;
                if (jsxutil.isJsxIntrinsicIdentifier(name)) {
                    return factory.createStringLiteral(idText(<Identifier>name));
                }
                else {
                    return createExpressionFromEntityName(factory, name);
                }
            }
        }

        function visitJsxExpression(node: JsxExpression) {
            return visitNode(node.expression, visitor, isExpression);
        }
    }
}
