/*@internal*/
namespace ts {
    /*@internal*/
    export function jsxi_generic(typeChecker: JsxTypeChecker): JsxImplementation {
        const enum JsxReferenceKind {
            Intrinsic,
            Component,
            Function,
            Error
        }
        interface NodeLinks extends ts.NodeLinks {
            jsxReferenceKind?: JsxReferenceKind; // Kind of JsxElement used during emit
            jsxGenericIntrinsicEntityName?: EntityName;
            jsxGenericIntrinsicEntityReferenced?: boolean;
            jsxGenericIntrinsicFactory?: JsxGenericIntrinsicFactory;
        }
        interface JsxGenericIntrinsicFactory {
            factorySymbol: Symbol;
            map: UnderscoreEscapedMap<JsxGenericIntrinsicInfo>;
        }
        interface JsxGenericIntrinsicInfo {
            callSignature: Signature;
            returnedType: Type;
            intrinsicSymbol: Symbol;
            attributesType: Type;
            childrenType?: Type;
        }

        let missingIntrinsicFactory: Identifier | undefined;

        return {
            info: {
                getJsxIntrinsicTagNamesAt: (location: Node) => {
                    const rtn: Symbol[] = [];

                    const intrinsicFactory = getIntrinsicFactory(location);

                    if (intrinsicFactory) {
                        intrinsicFactory.map.forEach((e) => {
                            if (e.intrinsicSymbol !== typeChecker.unknownSymbol) {
                                rtn.push(e.intrinsicSymbol);
                            }
                        });
                    }

                    return rtn;
                },
                isJsxIntrinsicIdentifier: jsxutil.isJsxIntrinsicIdentifier,
                getJsxNamespace: () => "",
                getJsxFragmentFactory: () => undefined
            },
            checker: {
                isJsxIntrinsicIdentifier: jsxutil.isJsxIntrinsicIdentifier,
                checkJsxOpeningLikeElementDeferred,
                checkJsxOpeningLikeElement,
                checkJsxFragment,
                checkJsxAttributes,
                checkApplicableSignatureForJsxOpeningLikeElement,
                getIntrinsicTagSymbol,
                getEffectiveFirstArgumentForJsxSignature,
                getContextualTypeForChildJsxExpression: () => undefined,
                resolveJsxOpeningLikeElement,
                elaborateJsxComponents,
                reportErrorResultsDoNotReport: () => false
            },
            emit: {
                sourceFileTransformer
            }
        };

        //----------------------------
        // Checker interface methods
        //----------------------------

        function checkJsxOpeningLikeElementDeferred(node: JsxElement | JsxSelfClosingElement) {
            const openingElement = isJsxElement(node) ? node.openingElement : node;
            typeChecker.checkGrammarJsxElement(openingElement);
            checkJsxPreconditions(openingElement);

            typeChecker.checkDeprecatedSignature(typeChecker.getResolvedSignature(openingElement), openingElement);

            const intrinsic = jsxutil.isJsxIntrinsicIdentifier(openingElement.tagName);

            if (intrinsic) {
                const symbol = getIntrinsicTagSymbol(openingElement);
                if (isJsxElement(node)) {
                    getNodeLinks(node.closingElement).resolvedSymbol = symbol;
                }
            }

            if (isJsxElement(node)) {
                if (!intrinsic) {
                    typeChecker.checkExpression(node.closingElement.tagName);
                }

                const allowedChildType = getJsxChildrenType(node);
                for (const child of node.children) {
                    const childType = (child.kind === SyntaxKind.JsxText)
                                            ? (!child.containsOnlyTriviaWhiteSpaces ? typeChecker.stringType : undefined)
                                            : typeChecker.checkExpression(child);

                    if (childType && allowedChildType && allowedChildType !== typeChecker.anyType) {
                        typeChecker.checkTypeAssignableToAndOptionallyElaborate(childType, allowedChildType, child, /*expr*/ undefined);
                    }
                }
            }
        }

        function checkJsxOpeningLikeElement(node: JsxElement | JsxSelfClosingElement, _checkmode?: CheckMode): Type {
            typeChecker.checkNodeDeferred(node);

            const tagName = isJsxElement(node) ? node.closingElement.tagName : node.tagName;

            if (jsxutil.isJsxIntrinsicIdentifier(tagName)) {
                const elementInfo = getIntrinsicInfo(node, <Identifier>tagName, /*markreferenced*/ true);
                if (elementInfo) {
                    if (elementInfo.returnedType) {
                        return elementInfo.returnedType;
                    }
                }

                return typeChecker.errorType;
            }
            else {
                const tagType = typeChecker.checkExpression(tagName);
                const ctorSig = typeChecker.getSignaturesOfType(tagType, SignatureKind.Construct);
                if (ctorSig && ctorSig.length > 0 && ctorSig[0]) {
                    return typeChecker.getReturnTypeOfSignature(ctorSig[0]);
                }
                const callSig = typeChecker.getSignaturesOfType(tagType, SignatureKind.Call);
                if (callSig && callSig.length > 0 && callSig[0]) {
                    return typeChecker.getReturnTypeOfSignature(callSig[0]);
                }

                return typeChecker.errorType;
            }
        }

        function checkJsxFragment(node: JsxFragment): Type {
            checkJsxPreconditions(node.openingFragment);

            const childrenTypes: Type[] = [];

            for (const child of node.children) {
                if (child.kind === SyntaxKind.JsxText) {
                    if (!child.containsOnlyTriviaWhiteSpaces) {
                        childrenTypes.push(typeChecker.stringType);
                    }
                }
                else if (child.kind === SyntaxKind.JsxExpression && !child.expression) {
                    continue;
                }
                else {
                    childrenTypes.push(typeChecker.checkExpressionForMutableLocation(child, /*checkMode*/ undefined));
                }
            }

            return typeChecker.createArrayType(typeChecker.getUnionType(childrenTypes, UnionReduction.Literal));
        }

        function checkJsxAttributes(node: JsxAttributes, checkMode: CheckMode | undefined) {
            return createJsxAttributesTypeFromAttributesProperty(node.parent, checkMode);
        }

        function checkApplicableSignatureForJsxOpeningLikeElement(node: JsxOpeningLikeElement, signature: Signature, relation: ESMap<string, RelationComparisonResult>, checkMode: CheckMode, reportErrors: boolean, containingMessageChain: (() => DiagnosticMessageChain | undefined) | undefined, errorOutputContainer: { errors?: Diagnostic[], skipLogging?: boolean }) {
            const paramType = getEffectiveFirstArgumentForJsxSignature(signature, node);
            const attributesType = typeChecker.checkExpressionWithContextualType(node.attributes, paramType, /*inferenceContext*/ undefined, checkMode);
            return typeChecker.checkTypeRelatedToAndOptionallyElaborate(attributesType, paramType, relation, reportErrors ? node.tagName : undefined, node.attributes, /*headMessage*/ undefined, containingMessageChain, errorOutputContainer);
        }

        function getIntrinsicTagSymbol(node: JsxOpeningLikeElement | JsxClosingElement): Symbol {
            const links = getNodeLinks(node);
            if (links.resolvedSymbol) {
                return links.resolvedSymbol;
            }

            if (!isIdentifier(node.tagName)) return Debug.fail();
            const elementInfo = getIntrinsicInfo(node, node.tagName);
            if (elementInfo) {
                return links.resolvedSymbol = elementInfo.intrinsicSymbol;
            }

            if (node) {
                const sourceFile = getSourceFileOfNode(node);
                const sourceFileLinks = getNodeLinks(sourceFile);

                if (sourceFileLinks.jsxGenericIntrinsicEntityName !== missingIntrinsicFactory) {
                    typeChecker.error(node, Diagnostics.Intrinsic_JSX_element_0_does_not_exist_in_factory_1, unescapeLeadingUnderscores(node.tagName.escapedText), getFullEntityName(sourceFileLinks.jsxGenericIntrinsicEntityName!));
                }
                else {
                    typeChecker.error(node, Diagnostics.No_JSX_intrinsic_factory_defined);
                }
            }

            return links.resolvedSymbol = typeChecker.unknownSymbol;
        }

        function getEffectiveFirstArgumentForJsxSignature(signature: Signature, node: JsxOpeningLikeElement) {
            switch (getJsxReferenceKind(node)) {
            case JsxReferenceKind.Intrinsic: {
                    const intrinsicInfo = getIntrinsicInfo(node, <Identifier>node.tagName);
                    return intrinsicInfo ? intrinsicInfo.attributesType : typeChecker.errorType;
                }
            case JsxReferenceKind.Component:
            case JsxReferenceKind.Function:
                return typeChecker.getTypeOfFirstParameterOfSignatureWithFallback(signature, typeChecker.emptyJsxObjectType);

            default:
                return typeChecker.emptyJsxObjectType;
            }
        }

        function resolveJsxOpeningLikeElement(node: JsxOpeningLikeElement, candidatesOutArray: Signature[] | undefined, checkMode: CheckMode): Signature {
            if (jsxutil.isJsxIntrinsicIdentifier(node.tagName)) {
                const intrinsicInfo = getIntrinsicInfo(node, <Identifier>node.tagName);
                if (intrinsicInfo && intrinsicInfo.callSignature) {
                    typeChecker.checkTypeAssignableToAndOptionallyElaborate(
                                    typeChecker.checkExpressionWithContextualType(node.attributes, intrinsicInfo.attributesType, /*mapper*/ undefined, CheckMode.Normal),
                                    intrinsicInfo.attributesType, node.tagName, node.attributes);

                    if (length(node.typeArguments)) {
                        forEach(node.typeArguments, typeChecker.checkSourceElement);
                        typeChecker.diagnostics.add(createDiagnosticForNodeArray(getSourceFileOfNode(node), node.typeArguments!, Diagnostics.Expected_0_type_arguments_but_got_1, 0, length(node.typeArguments)));
                    }

                    return intrinsicInfo.callSignature;
                }

                return typeChecker.unknownSignature;
            }

            const exprTypes = typeChecker.checkExpression(node.tagName);
            const apparentType = typeChecker.getApparentType(exprTypes);
            if (apparentType === typeChecker.errorType) {
                return typeChecker.resolveErrorCall(node);
            }

            if (!((exprTypes.flags & TypeFlags.String) || (exprTypes.flags & TypeFlags.StringLiteral))) {
                const apparentElemType = typeChecker.getApparentType(exprTypes);
                let signatures = typeChecker.getSignaturesOfType(apparentElemType, SignatureKind.Construct);
                if (signatures.length === 0) {
                    signatures = typeChecker.getSignaturesOfType(apparentElemType, SignatureKind.Call);
                }

                if (typeChecker.isUntypedFunctionCall(exprTypes, apparentType, signatures.length, /*constructSignatures*/ 0)) {
                    return typeChecker.resolveUntypedCall(node);
                }

                if (signatures.length > 0) {
                    return typeChecker.resolveCall(node, signatures, candidatesOutArray, checkMode, SignatureFlags.None);
                }
            }

            typeChecker.error(node.tagName, Diagnostics.JSX_element_type_0_does_not_have_any_construct_or_call_signatures, getTextOfNode(node.tagName));
            return typeChecker.resolveErrorCall(node);
        }

        function elaborateJsxComponents(node: JsxAttributes, source: Type, target: Type, relation: ESMap<string, RelationComparisonResult>, containingMessageChain: (() => DiagnosticMessageChain | undefined) | undefined, errorOutputContainer: { errors?: Diagnostic[], skipLogging?: boolean } | undefined) {
            return typeChecker.elaborateElementwise(generateJsxAttributes(node), source, target, relation, containingMessageChain, errorOutputContainer);
        }

        //----------------------------
        // Checker internals
        //----------------------------

        function *generateJsxAttributes(node: JsxAttributes): ElaborationIterator {
            if (!length(node.properties)) return;
            for (const prop of node.properties) {
                if (isJsxSpreadAttribute(prop)) continue;
                yield { errorNode: prop.name, innerExpression: prop.initializer, nameType: typeChecker.getLiteralType(idText(prop.name)) };
            }
        }

        function createJsxAttributesTypeFromAttributesProperty(openingLikeElement: JsxOpeningLikeElement, checkMode: CheckMode | undefined) {
            const attributes = openingLikeElement.attributes;
            const allAttributesTable = typeChecker.strictNullChecks ? createSymbolTable() : undefined;
            let attributesTable = createSymbolTable();
            let spread: Type = typeChecker.emptyJsxObjectType;
            let hasSpreadAnyType = false;
            let typeToIntersect: Type | undefined;
            let objectFlags: ObjectFlags = ObjectFlags.JsxAttributes;

            for (const attributeDecl of attributes.properties) {
                const member = attributeDecl.symbol;
                if (isJsxAttribute(attributeDecl)) {
                    const exprType = typeChecker.checkJsxAttribute(attributeDecl, checkMode);
                    objectFlags |= getObjectFlags(exprType) & ObjectFlags.PropagatingFlags;

                    const attributeSymbol = typeChecker.createSymbol(SymbolFlags.Property | member.flags, member.escapedName);
                    attributeSymbol.declarations = member.declarations;
                    attributeSymbol.parent = member.parent;
                    if (member.valueDeclaration) {
                        attributeSymbol.valueDeclaration = member.valueDeclaration;
                    }
                    attributeSymbol.type = exprType;
                    attributeSymbol.target = member;
                    attributesTable.set(attributeSymbol.escapedName, attributeSymbol);
                    allAttributesTable?.set(attributeSymbol.escapedName, attributeSymbol);
                }
                else {
                    Debug.assert(attributeDecl.kind === SyntaxKind.JsxSpreadAttribute);
                    if (attributesTable.size > 0) {
                        spread = typeChecker.getSpreadType(spread, createJsxAttributesType(), attributes.symbol, objectFlags, /*readonly*/ false);
                        attributesTable = createSymbolTable();
                    }
                    const exprType = typeChecker.getReducedType(typeChecker.checkExpressionCached(attributeDecl.expression, checkMode));
                    if (typeChecker.isTypeAny(exprType)) {
                        hasSpreadAnyType = true;
                    }
                    if (typeChecker.isValidSpreadType(exprType)) {
                        spread = typeChecker.getSpreadType(spread, exprType, attributes.symbol, objectFlags, /*readonly*/ false);
                        if (allAttributesTable) {
                            typeChecker.checkSpreadPropOverrides(exprType, allAttributesTable, attributeDecl);
                        }
                    }
                    else {
                        typeToIntersect = typeToIntersect ? typeChecker.getIntersectionType([typeToIntersect, exprType]) : exprType;
                    }
                }
            }

            if (!hasSpreadAnyType) {
                if (attributesTable.size > 0) {
                    spread = typeChecker.getSpreadType(spread, createJsxAttributesType(), attributes.symbol, objectFlags, /*readonly*/ false);
                }
            }

            if (hasSpreadAnyType) {
                return typeChecker.anyType;
            }
            if (typeToIntersect && spread !== typeChecker.emptyJsxObjectType) {
                return typeChecker.getIntersectionType([typeToIntersect, spread]);
            }
            return typeToIntersect || (spread === typeChecker.emptyJsxObjectType ? createJsxAttributesType() : spread);

            /**
             * Create anonymous type from given attributes symbol table.
             * @param symbol a symbol of JsxAttributes containing attributes corresponding to attributesTable
             * @param attributesTable a symbol table of attributes property
             */
            function createJsxAttributesType() {
                objectFlags |= typeChecker.freshObjectLiteralFlag;
                const result = typeChecker.createAnonymousType(attributes.symbol, attributesTable, emptyArray, emptyArray, /*stringIndexInfo*/ undefined, /*numberIndexInfo*/ undefined);
                result.objectFlags |= objectFlags | ObjectFlags.ObjectLiteral | ObjectFlags.ContainsObjectOrArrayLiteral;
                return result;
            }
        }

        function checkJsxPreconditions(node: Node) {
            // Preconditions for using JSX
            if ((typeChecker.compilerOptions.jsx || JsxEmit.None) === JsxEmit.None) {
                typeChecker.error(node, Diagnostics.Cannot_use_JSX_unless_the_jsx_flag_is_provided);
            }
        }

        function getJsxReferenceKind(node: JsxOpeningLikeElement): JsxReferenceKind {
            const nodeLinks = getNodeLinks(node);

            if (nodeLinks.jsxReferenceKind) {
                return nodeLinks.jsxReferenceKind;
            }

            if (jsxutil.isJsxIntrinsicIdentifier(node.tagName)) {
                return nodeLinks.jsxReferenceKind = JsxReferenceKind.Intrinsic;
            }
            const tagType = typeChecker.getApparentType(typeChecker.checkExpression(node.tagName));
            if (length(typeChecker.getSignaturesOfType(tagType, SignatureKind.Construct))) {
                return nodeLinks.jsxReferenceKind = JsxReferenceKind.Component;
            }
            if (length(typeChecker.getSignaturesOfType(tagType, SignatureKind.Call))) {
                return nodeLinks.jsxReferenceKind = JsxReferenceKind.Function;
            }
            return nodeLinks.jsxReferenceKind = JsxReferenceKind.Error;
        }

        function getJsxChildrenType(node: JsxElement) {
            const tagName = node.openingElement.tagName;

            if (jsxutil.isJsxIntrinsicIdentifier(tagName)) {
                const elementInfo = getIntrinsicInfo(node, <Identifier>tagName);
                if (!elementInfo) {
                    return undefined;
                }

                if (elementInfo.childrenType) {
                    return elementInfo.childrenType;
                }
            }
            else {
                const elementType = typeChecker.checkExpression(tagName);
                let signatures = typeChecker.getSignaturesOfType(elementType, SignatureKind.Construct);
                if (signatures.length === 0) {
                    signatures = typeChecker.getSignaturesOfType(elementType, SignatureKind.Call);
                    if (signatures.length === 0) {
                        typeChecker.error(tagName, Diagnostics.JSX_element_type_0_does_not_have_any_construct_or_call_signatures, getTextOfNode(tagName));
                        return undefined;
                    }
                }

                const childTypes: Type[] = [];

                for(const signature of signatures) {
                    const t = validateSignature(signature, 0);
                    if (t && t.childrenType) {
                        childTypes.push(t.childrenType);
                    }
                }

                if (childTypes) {
                    return typeChecker.getUnionType(childTypes, UnionReduction.Literal);
                }
            }

            typeChecker.error(tagName, Diagnostics.JSX_element_0_has_no_children, getTextOfNode(tagName));
            return undefined;
        }

        //----------------------------
        // Emit interface methods
        //----------------------------

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

            function visitJsxElement(node: JsxElement, isChild: boolean) {
                return visitJsxOpeningLikeElementCreateElement(node.openingElement, node.children, isChild, /*location*/ node);
            }

            function visitJsxSelfClosingElement(node: JsxSelfClosingElement, isChild: boolean) {
                return visitJsxOpeningLikeElementCreateElement(node, /*children*/ undefined, isChild, /*location*/ node);
            }

            function visitJsxFragment(node: JsxFragment, isChild: boolean) {
                return visitJsxOpeningFragmentCreateElement(node.openingFragment, node.children, isChild, /*location*/ node);
            }

            function visitJsxOpeningLikeElementCreateElement(node: JsxOpeningLikeElement, children: readonly JsxChild[] | undefined, isChild: boolean, location: TextRange) {
                let objectProperties: Expression | undefined;
                const attrs = node.attributes.properties;
                if (attrs.length === 0) {
                    objectProperties = factory.createNull();
                    // When there are no attributes, React wants "null"
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

                const element = setTextRange(emitCreateExpressionForJsxElement(node, objectProperties, mapDefined(children, transformJsxChildToExpression)), location);

                if (isChild) {
                    startOnNewLine(element);
                }

                return element;
            }

            function visitJsxOpeningFragmentCreateElement(_node: JsxOpeningFragment, children: readonly JsxChild[], isChild: boolean, location: TextRange) {
                const element = setTextRange(emitCreateExpressionForJsxFragment(mapDefined(children, transformJsxChildToExpression)), location);

                if (isChild) {
                    startOnNewLine(element);
                }

                return element;
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

            function visitJsxExpression(node: JsxExpression) {
                return visitNode(node.expression, visitor, isExpression);
            }

            function emitCreateExpressionForJsxElement(jsxElement: JsxOpeningLikeElement, props: Expression, children: readonly Expression[]): LeftHandSideExpression {
                const tagName = jsxElement.tagName;

                switch (getJsxReferenceKind(jsxElement)) {
                case JsxReferenceKind.Intrinsic:
                     if (!isIdentifier(tagName)) Debug.fail();
                     return factory.createCallExpression(
                                createJsxFactoryExpressionFromEntityName(factory, getIntrinsicEntityName(jsxElement), jsxElement),
                                /*typeArguments*/ undefined,
                                createArguments(factory.createStringLiteral(idText(tagName)))
                            );

                case JsxReferenceKind.Component:
                    return factory.createNewExpression(
                               createExpressionFromEntityName(factory, tagName),
                               /*typeArguments*/ undefined,
                               createArguments()
                           );

                case JsxReferenceKind.Function:
                default: // Default to function for emit.
                    return factory.createCallExpression(
                               createExpressionFromEntityName(factory, tagName),
                               /*typeArguments*/ undefined,
                               createArguments()
                           );
                }

                function createArguments(firstArg?: Expression) {
                    const argumentsList: Expression[] = [];

                    if (firstArg) {
                        argumentsList.push(firstArg);
                    }

                    if (props) {
                        argumentsList.push(props);
                    }

                    if (children && children.length > 0) {
                        if (!props) {
                            argumentsList.push(factory.createNull());
                        }

                        if (children.length > 1) {
                            for (const child of children) {
                                startOnNewLine(child);
                                argumentsList.push(child);
                            }
                        }
                        else {
                            argumentsList.push(children[0]);
                        }
                    }

                    return argumentsList;
                }
            }

            function emitCreateExpressionForJsxFragment(children: readonly Expression[]): LeftHandSideExpression {
                return factory.createArrayLiteralExpression(children, /*multiLine*/ true);
            }
        }

        //----------------------------
        // internals
        //----------------------------

        function getIntrinsicInfo(location: Node, tagName: Identifier, markreferenced?: boolean) {
            const intrinsicFactory = getIntrinsicFactory(location, markreferenced);
            return intrinsicFactory && (intrinsicFactory.map.get(tagName.escapedText) || intrinsicFactory.map.get("" as __String));
        }

        function getIntrinsicFactory(location: Node, markreferenced?: boolean): JsxGenericIntrinsicFactory | undefined {
            const sourceFile = getSourceFileOfNode(location);
            const sourceFileLinks = getNodeLinks(sourceFile);

            if (!sourceFileLinks.jsxGenericIntrinsicFactory) {
                const intrinsicEntityName = getIntrinsicEntityName(location);

                if (intrinsicEntityName !== missingIntrinsicFactory) {
                    const symbol = typeChecker.resolveEntityName(intrinsicEntityName, SymbolFlags.Function, /*ignoreErrors*/ true, /*dontResolveAlias*/ true, sourceFile);
                    if (symbol) {
                        sourceFileLinks.jsxGenericIntrinsicFactory = createIntrinsicFactory(location, symbol);
                    }
                    else {
                        typeChecker.error(location, Diagnostics.Invalid_factory_in_jsx_intrinsic_factory_pragma);
                    }
                }
            }

            if (markreferenced && sourceFileLinks.jsxGenericIntrinsicEntityName && !sourceFileLinks.jsxGenericIntrinsicEntityReferenced) {
                sourceFileLinks.jsxGenericIntrinsicEntityReferenced = true;
                typeChecker.setEntityReferenced(sourceFile, sourceFileLinks.jsxGenericIntrinsicEntityName, SymbolFlags.Function);
            }

            return sourceFileLinks.jsxGenericIntrinsicFactory;
        }

        function getIntrinsicEntityName(location: Node): EntityName {
            const sourceFile = getSourceFileOfNode(location);
            const sourceFileLinks = getNodeLinks(sourceFile);

            if (!sourceFileLinks.jsxGenericIntrinsicEntityName) {
                const jsxPragmaFactory = sourceFile.pragmas.get("jsx-intrinsic-factory");
                const chosenpragma = isArray(jsxPragmaFactory) ? jsxPragmaFactory[0] : jsxPragmaFactory;
                if (chosenpragma) {
                    sourceFileLinks.jsxGenericIntrinsicEntityName = parseIsolatedEntityName(chosenpragma.arguments.factory, typeChecker.languageVersion);
                    visitNode(sourceFileLinks.jsxGenericIntrinsicEntityName, jsxutil.markAsSynthetic);
                }
                else {
                    if (!missingIntrinsicFactory) {
                        missingIntrinsicFactory = typeChecker.factory.createIdentifier("???");
                    }
                    sourceFileLinks.jsxGenericIntrinsicEntityName = missingIntrinsicFactory;
                }
            }

            return sourceFileLinks.jsxGenericIntrinsicEntityName!;
        }

        function createIntrinsicFactory(errorNode: Node, createElementFactorySymbol: Symbol): JsxGenericIntrinsicFactory | undefined {
            const intrinsicInfo = createUnderscoreEscapedMap<JsxGenericIntrinsicInfo>();

            const createElementFactoryType = createElementFactorySymbol && typeChecker.getTypeOfSymbol(createElementFactorySymbol);
            const createElementFactorySignatures = createElementFactoryType && typeChecker.getSignaturesOfType(createElementFactoryType, SignatureKind.Call);
            if (!(createElementFactorySignatures && createElementFactorySignatures.length > 0)) {
                    typeChecker.error(errorNode, Diagnostics.Invalid_factory_in_jsx_intrinsic_factory_pragma);
                    return undefined;
            }

            for (const callSignature of createElementFactorySignatures) {
                const callArgTypes = validateSignature(callSignature, 1);
                if (!callArgTypes) {
                    typeChecker.error(callSignature.declaration, Diagnostics.Invalid_JSX_intrinsic_factory);
                    continue;
                }

                const todoIntrinsicTypes = [ typeChecker.getTypeOfSymbol(callSignature.parameters[0]) ];
                let todoIndex = 0;
                if (!(todoIntrinsicTypes[0])) {
                    typeChecker.error(callSignature.declaration, Diagnostics.Invalid_JSX_intrinsic_factory);
                    continue;
                }

                const returnedType = typeChecker.getReturnTypeOfSignature(callSignature);

                while (todoIndex < todoIntrinsicTypes.length) {
                    const type = todoIntrinsicTypes[todoIndex++];

                    if (type.flags & TypeFlags.String) {
                        intrinsicInfo.set("" as __String, { callSignature, returnedType, intrinsicSymbol: typeChecker.unknownSymbol, attributesType: callArgTypes.attributesType, childrenType: callArgTypes.childrenType });
                    }
                    else if (type.flags & TypeFlags.StringLiteral) {
                        intrinsicInfo.set(escapeLeadingUnderscores((<StringLiteralType>type).value), { callSignature, returnedType, intrinsicSymbol: type.symbol, attributesType: callArgTypes.attributesType, childrenType: callArgTypes.childrenType });
                    }
                    else if (type.flags & TypeFlags.Union) {
                        (<UnionType>type).types.forEach((t) => {
                                                            if (todoIntrinsicTypes.indexOf(t) === -1) {
                                                                todoIntrinsicTypes.push(t);
                                                            }
                                                        });
                    }
                    else {
                        typeChecker.error(callSignature.declaration, Diagnostics.Invalid_JSX_intrinsic_factory);
                        break;
                    }
                }
            }

            return { factorySymbol: createElementFactorySymbol, map: intrinsicInfo };
        }

        function validateSignature(signature: Signature, offset: number): {
                    attributesType: Type;
                    childrenType: Type | undefined;
                } | undefined {
            if (!(signature.parameters.length >= offset && signature.parameters.length <= offset + 2)) {
                return undefined;
            }

            let attributesType: Type;
            let childrenType: Type | undefined;

            if (signature.parameters.length > offset) {
                attributesType = typeChecker.getTypeOfSymbol(signature.parameters[offset]);
            }
            else {
                attributesType = typeChecker.emptyJsxObjectType;
            }

            if (signature.parameters.length > offset + 1) {
                if (!typeChecker.signatureHasRestParameter(signature)) {
                    return undefined;
                }

                const type = typeChecker.getTypeOfSymbol(signature.parameters[offset + 1]);
                if (!typeChecker.isArrayType(type)) {
                    return undefined;
                }

                childrenType = typeChecker.getUnionType(typeChecker.getTypeArguments(type), UnionReduction.Literal);
            }

            return {
                    attributesType,
                    childrenType
                };
        }

        function getNodeLinks(node: Node): NodeLinks {
            return <NodeLinks>typeChecker.getNodeLinks(node);
        }
    }
}
