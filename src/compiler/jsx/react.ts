/*@internal*/
namespace ts {
    /*@internal*/
    export function jsxi_react(typeChecker: JsxTypeChecker): JsxImplementation {
        const enum JsxReferenceKind {
            Component,
            Function,
            Mixed
        }

        let _jsxNamespace: __String;
        let _jsxFactoryEntity: EntityName | undefined;

        return {
            info: {
                getJsxIntrinsicTagNamesAt: (location: Node) => {
                    const intrinsics = getJsxType(JsxNames.IntrinsicElements, location);
                    return intrinsics ? typeChecker.getPropertiesOfType(intrinsics) : emptyArray;
                },
                isJsxIntrinsicIdentifier: jsxutil.isJsxIntrinsicIdentifier,
                getJsxNamespace: (n) => unescapeLeadingUnderscores(getJsxNamespace(n)),
                getJsxFragmentFactory: (n) => {
                    const jsxFragmentFactory = getJsxFragmentFactoryEntity(n);
                    return jsxFragmentFactory && unescapeLeadingUnderscores(getFirstIdentifier(jsxFragmentFactory).escapedText);
                }
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
                getContextualTypeForChildJsxExpression,
                resolveJsxOpeningLikeElement,
                elaborateJsxComponents,
                reportErrorResultsDoNotReport
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

            const sig = typeChecker.getResolvedSignature(openingElement);
            typeChecker.checkDeprecatedSignature(sig, openingElement);
            checkJsxReturnAssignableToAppropriateBound(getJsxReferenceKind(openingElement), typeChecker.getReturnTypeOfSignature(sig), openingElement);

            if (isJsxElement(node)) {
                const closingElement = node.closingElement;
                // Perform resolution on the closing tag so that rename/go to definition/etc work
                if (jsxutil.isJsxIntrinsicIdentifier(closingElement.tagName)) {
                    getIntrinsicTagSymbol(closingElement);
                }
                else {
                    typeChecker.checkExpression(closingElement.tagName);
                }

                checkJsxChildren(node);
            }
        }

        function checkJsxOpeningLikeElement(node: JsxElement | JsxSelfClosingElement, _checkmode?: CheckMode): Type {
            typeChecker.checkNodeDeferred(node);
            return getJsxElementTypeAt(node) || typeChecker.anyType;
        }

        function checkJsxFragment(node: JsxFragment): Type {
            checkJsxPreconditions(node.openingFragment);

            // by default, jsx:'react' will use jsxFactory = React.createElement and jsxFragmentFactory = React.Fragment
            // if jsxFactory compiler option is provided, ensure jsxFragmentFactory compiler option or @jsxFrag pragma is provided too
            const nodeSourceFile = getSourceFileOfNode(node);
            if (getJSXTransformEnabled(typeChecker.compilerOptions) && (typeChecker.compilerOptions.jsxFactory || nodeSourceFile.pragmas.has("jsx"))
                && !typeChecker.compilerOptions.jsxFragmentFactory && !nodeSourceFile.pragmas.has("jsxfrag")) {
                typeChecker.error(node, typeChecker.compilerOptions.jsxFactory
                    ? Diagnostics.The_jsxFragmentFactory_compiler_option_must_be_provided_to_use_JSX_fragments_with_the_jsxFactory_compiler_option
                    : Diagnostics.An_jsxFrag_pragma_is_required_when_using_an_jsx_pragma_with_JSX_fragments);
            }

            checkJsxChildren(node);
            return getJsxElementTypeAt(node) || typeChecker.anyType;
        }

        /**
         * Check attributes property of opening-like element. This function is called during chooseOverload to get call signature of a JSX opening-like element.
         * (See "checkApplicableSignatureForJsxOpeningLikeElement" for how the function is used)
         * @param node a JSXAttributes to be resolved of its type
         */
        function checkJsxAttributes(node: JsxAttributes, checkMode: CheckMode | undefined) {
            return createJsxAttributesTypeFromAttributesProperty(node.parent, checkMode);
        }

        /**
         * Check if the given signature can possibly be a signature called by the JSX opening-like element.
         * @param node a JSX opening-like element we are trying to figure its call signature
         * @param signature a candidate signature we are trying whether it is a call signature
         * @param relation a relationship to check parameter and argument type
         */
        function checkApplicableSignatureForJsxOpeningLikeElement(
            node: JsxOpeningLikeElement,
            signature: Signature,
            relation: ESMap<string, RelationComparisonResult>,
            checkMode: CheckMode,
            reportErrors: boolean,
            containingMessageChain: (() => DiagnosticMessageChain | undefined) | undefined,
            errorOutputContainer: { errors?: Diagnostic[], skipLogging?: boolean }
        ) {
            // Stateless function components can have maximum of three arguments: "props", "context", and "updater".
            // However "context" and "updater" are implicit and can't be specify by users. Only the first parameter, props,
            // can be specified by users through attributes property.
            const paramType = getEffectiveFirstArgumentForJsxSignature(signature, node);
            const attributesType = typeChecker.checkExpressionWithContextualType(node.attributes, paramType, /*inferenceContext*/ undefined, checkMode);
            return checkTagNameDoesNotExpectTooManyArguments() && typeChecker.checkTypeRelatedToAndOptionallyElaborate(
                attributesType,
                paramType,
                relation,
                reportErrors ? node.tagName : undefined,
                node.attributes,
                /*headMessage*/ undefined,
                containingMessageChain,
                errorOutputContainer);

            function checkTagNameDoesNotExpectTooManyArguments(): boolean {
                if (getJsxNamespaceContainerForImplicitImport(node)) {
                    return true; // factory is implicitly jsx/jsxdev - assume it fits the bill, since we don't strongly look for the jsx/jsxs/jsxDEV factory APIs anywhere else (at least not yet)
                }
                const tagType = isJsxOpeningElement(node) || isJsxSelfClosingElement(node) && !jsxutil.isJsxIntrinsicIdentifier(node.tagName) ? typeChecker.checkExpression(node.tagName) : undefined;
                if (!tagType) {
                    return true;
                }
                const tagCallSignatures = typeChecker.getSignaturesOfType(tagType, SignatureKind.Call);
                if (!length(tagCallSignatures)) {
                    return true;
                }
                const factory = getJsxFactoryEntity(node);
                if (!factory) {
                    return true;
                }
                const factorySymbol = typeChecker.resolveEntityName(factory, SymbolFlags.Value, /*ignoreErrors*/ true, /*dontResolveAlias*/ false, node);
                if (!factorySymbol) {
                    return true;
                }

                const factoryType = typeChecker.getTypeOfSymbol(factorySymbol);
                const callSignatures = typeChecker.getSignaturesOfType(factoryType, SignatureKind.Call);
                if (!length(callSignatures)) {
                    return true;
                }

                let hasFirstParamSignatures = false;
                let maxParamCount = 0;
                // Check that _some_ first parameter expects a FC-like thing, and that some overload of the SFC expects an acceptable number of arguments
                for (const sig of callSignatures) {
                    const firstparam = typeChecker.getTypeAtPosition(sig, 0);
                    const signaturesOfParam = typeChecker.getSignaturesOfType(firstparam, SignatureKind.Call);
                    if (!length(signaturesOfParam)) continue;
                    for (const paramSig of signaturesOfParam) {
                        hasFirstParamSignatures = true;
                        if (typeChecker.hasEffectiveRestParameter(paramSig)) {
                            return true; // some signature has a rest param, so function components can have an arbitrary number of arguments
                        }
                        const paramCount = typeChecker.getParameterCount(paramSig);
                        if (paramCount > maxParamCount) {
                            maxParamCount = paramCount;
                        }
                    }
                }
                if (!hasFirstParamSignatures) {
                    // Not a single signature had a first parameter which expected a signature - for back compat, and
                    // to guard against generic factories which won't have signatures directly, do not error
                    return true;
                }
                let absoluteMinArgCount = Infinity;
                for (const tagSig of tagCallSignatures) {
                    const tagRequiredArgCount = typeChecker.getMinArgumentCount(tagSig);
                    if (tagRequiredArgCount < absoluteMinArgCount) {
                        absoluteMinArgCount = tagRequiredArgCount;
                    }
                }
                if (absoluteMinArgCount <= maxParamCount) {
                    return true; // some signature accepts the number of arguments the function component provides
                }

                if (reportErrors) {
                    const diag = createDiagnosticForNode(node.tagName, Diagnostics.Tag_0_expects_at_least_1_arguments_but_the_JSX_factory_2_provides_at_most_3, entityNameToString(node.tagName), absoluteMinArgCount, entityNameToString(factory), maxParamCount);
                    const tagNameDeclaration = typeChecker.getSymbolAtLocation(node.tagName)?.valueDeclaration;
                    if (tagNameDeclaration) {
                        addRelatedInfo(diag, createDiagnosticForNode(tagNameDeclaration, Diagnostics._0_is_declared_here, entityNameToString(node.tagName)));
                    }
                    if (errorOutputContainer && errorOutputContainer.skipLogging) {
                        (errorOutputContainer.errors || (errorOutputContainer.errors = [])).push(diag);
                    }
                    if (!errorOutputContainer.skipLogging) {
                        typeChecker.diagnostics.add(diag);
                    }
                }
                return false;
            }
        }

        /**
         * Looks up an intrinsic tag name and returns a symbol that either points to an intrinsic
         * property (in which case nodeLinks.jsxFlags will be IntrinsicNamedElement) or an intrinsic
         * string index signature (in which case nodeLinks.jsxFlags will be IntrinsicIndexedElement).
         * May also return unknownSymbol if both of these lookups fail.
         */
        function getIntrinsicTagSymbol(node: JsxOpeningLikeElement | JsxClosingElement): Symbol {
            const links = typeChecker.getNodeLinks(node);
            if (!links.resolvedSymbol) {
                const intrinsicElementsType = getJsxType(JsxNames.IntrinsicElements, node);
                if (intrinsicElementsType !== typeChecker.errorType) {
                    // Property case
                    if (!isIdentifier(node.tagName)) return Debug.fail();
                    const intrinsicProp = typeChecker.getPropertyOfType(intrinsicElementsType, node.tagName.escapedText);
                    if (intrinsicProp) {
                        links.jsxFlags |= JsxFlags.IntrinsicNamedElement;
                        return links.resolvedSymbol = intrinsicProp;
                    }

                    // Intrinsic string indexer case
                    const indexSignatureType = typeChecker.getIndexTypeOfType(intrinsicElementsType, IndexKind.String);
                    if (indexSignatureType) {
                        links.jsxFlags |= JsxFlags.IntrinsicIndexedElement;
                        return links.resolvedSymbol = intrinsicElementsType.symbol;
                    }

                    // Wasn't found
                    typeChecker.error(node, Diagnostics.Property_0_does_not_exist_on_type_1, idText(node.tagName), "JSX." + JsxNames.IntrinsicElements);
                    return links.resolvedSymbol = typeChecker.unknownSymbol;
                }
                else {
                    if (typeChecker.noImplicitAny) {
                        typeChecker.error(node, Diagnostics.JSX_element_implicitly_has_type_any_because_no_interface_JSX_0_exists, unescapeLeadingUnderscores(JsxNames.IntrinsicElements));
                    }
                    return links.resolvedSymbol = typeChecker.unknownSymbol;
                }
            }
            return links.resolvedSymbol;
        }

        function getEffectiveFirstArgumentForJsxSignature(signature: Signature, node: JsxOpeningLikeElement) {
            return getJsxReferenceKind(node) !== JsxReferenceKind.Component
                ? getJsxPropsTypeFromCallSignature(signature, node)
                : getJsxPropsTypeFromClassType(signature, node);
        }

        function getContextualTypeForChildJsxExpression(node: JsxElement, child: JsxChild) {
            const attributesType = typeChecker.getApparentTypeOfContextualType(node.openingElement.tagName);
            // JSX expression is in children of JSX Element, we will look for an "children" attribute (we get the name from JSX.ElementAttributesProperty)
            const jsxChildrenPropertyName = getJsxElementChildrenPropertyName(getJsxNamespaceAt(node));
            if (!(attributesType && !typeChecker.isTypeAny(attributesType) && jsxChildrenPropertyName && jsxChildrenPropertyName !== "")) {
                return undefined;
            }
            const realChildren = getSemanticJsxChildren(node.children);
            const childIndex = realChildren.indexOf(child);
            const childFieldType = typeChecker.getTypeOfPropertyOfContextualType(attributesType, jsxChildrenPropertyName);
            return childFieldType && (realChildren.length === 1 ? childFieldType : typeChecker.mapType(childFieldType, t => {
                if (typeChecker.isArrayLikeType(t)) {
                    return typeChecker.getIndexedAccessType(t, typeChecker.getLiteralType(childIndex), /*noUncheckedIndexedAccessCandidate*/ undefined, /*accessNode*/ undefined, /*aliasSymbol*/ undefined, /*aliasTypeArguments*/ undefined, /*accessFlags*/ AccessFlags.None);
                }
                else {
                    return t;
                }
            }, /*noReductions*/ true));
        }

        function resolveJsxOpeningLikeElement(node: JsxOpeningLikeElement, candidatesOutArray: Signature[] | undefined, checkMode: CheckMode): Signature {
            if (jsxutil.isJsxIntrinsicIdentifier(node.tagName)) {
                const result = getIntrinsicAttributesTypeFromJsxOpeningLikeElement(node);
                const fakeSignature = createSignatureForJSXIntrinsic(node, result);
                typeChecker.checkTypeAssignableToAndOptionallyElaborate(typeChecker.checkExpressionWithContextualType(node.attributes, getEffectiveFirstArgumentForJsxSignature(fakeSignature, node), /*mapper*/ undefined, CheckMode.Normal), result, node.tagName, node.attributes);
                if (length(node.typeArguments)) {
                    forEach(node.typeArguments, typeChecker.checkSourceElement);
                    typeChecker.diagnostics.add(createDiagnosticForNodeArray(getSourceFileOfNode(node), node.typeArguments!, Diagnostics.Expected_0_type_arguments_but_got_1, 0, length(node.typeArguments)));
                }
                return fakeSignature;
            }
            const exprTypes = typeChecker.checkExpression(node.tagName);
            const apparentType = typeChecker.getApparentType(exprTypes);
            if (apparentType === typeChecker.errorType) {
                return typeChecker.resolveErrorCall(node);
            }

            const signatures = getUninstantiatedJsxSignaturesOfType(exprTypes, node);
            if (typeChecker.isUntypedFunctionCall(exprTypes, apparentType, signatures.length, /*constructSignatures*/ 0)) {
                return typeChecker.resolveUntypedCall(node);
            }

            if (signatures.length === 0) {
                // We found no signatures at all, which is an error
                typeChecker.error(node.tagName, Diagnostics.JSX_element_type_0_does_not_have_any_construct_or_call_signatures, getTextOfNode(node.tagName));
                return typeChecker.resolveErrorCall(node);
            }

            return typeChecker.resolveCall(node, signatures, candidatesOutArray, checkMode, SignatureFlags.None);
        }

        function elaborateJsxComponents(
            node: JsxAttributes,
            source: Type,
            target: Type,
            relation: ESMap<string, RelationComparisonResult>,
            containingMessageChain: (() => DiagnosticMessageChain | undefined) | undefined,
            errorOutputContainer: { errors?: Diagnostic[], skipLogging?: boolean } | undefined
        ) {
            let result = typeChecker.elaborateElementwise(generateJsxAttributes(node), source, target, relation, containingMessageChain, errorOutputContainer);
            let invalidTextDiagnostic: DiagnosticMessage | undefined;
            if (isJsxOpeningElement(node.parent) && isJsxElement(node.parent.parent)) {
                const containingElement = node.parent.parent;
                const childPropName = getJsxElementChildrenPropertyName(getJsxNamespaceAt(node));
                const childrenPropName = childPropName === undefined ? "children" : unescapeLeadingUnderscores(childPropName);
                const childrenNameType = typeChecker.getLiteralType(childrenPropName);
                const childrenTargetType = typeChecker.getIndexedAccessType(target, childrenNameType, /*noUncheckedIndexedAccessCandidate*/ undefined, /*accessNode*/ undefined, /*aliasSymbol*/ undefined, /*aliasTypeArguments*/ undefined, /*accessFlags*/ AccessFlags.None);
                const validChildren = getSemanticJsxChildren(containingElement.children);
                if (!length(validChildren)) {
                    return result;
                }
                const moreThanOneRealChildren = length(validChildren) > 1;
                const arrayLikeTargetParts = typeChecker.filterType(childrenTargetType, typeChecker.isArrayOrTupleLikeType);
                const nonArrayLikeTargetParts = typeChecker.filterType(childrenTargetType, t => !typeChecker.isArrayOrTupleLikeType(t));
                if (moreThanOneRealChildren) {
                    if (arrayLikeTargetParts !== typeChecker.neverType) {
                        const realSource = typeChecker.createTupleType(checkJsxChildren(containingElement, CheckMode.Normal), /*elementFlags*/ undefined, /*readonly*/ false, /*namedMemberDeclarations*/ undefined);
                        const children = generateJsxChildren(containingElement, getInvalidTextualChildDiagnostic);
                        result = typeChecker.elaborateElementwise(children, realSource, arrayLikeTargetParts, relation, containingMessageChain, errorOutputContainer) || result;
                    }
                    else if (!typeChecker.isTypeRelatedTo(typeChecker.getIndexedAccessType(source, childrenNameType, /*noUncheckedIndexedAccessCandidate*/ undefined, /*accessNode*/ undefined, /*aliasSymbol*/ undefined, /*aliasTypeArguments*/ undefined, /*accessFlags*/ AccessFlags.None), childrenTargetType, relation)) {
                        // arity mismatch
                        result = true;
                        const diag = typeChecker.error(
                            containingElement.openingElement.tagName,
                            Diagnostics.This_JSX_tag_s_0_prop_expects_a_single_child_of_type_1_but_multiple_children_were_provided,
                            childrenPropName,
                            typeChecker.typeToString(childrenTargetType, /*enclosingDeclaration*/ undefined, /*flags*/ TypeFormatFlags.AllowUniqueESSymbolType | TypeFormatFlags.UseAliasDefinedOutsideCurrentScope, /*writer*/ createTextWriter(""))
                        );
                        if (errorOutputContainer && errorOutputContainer.skipLogging) {
                            (errorOutputContainer.errors || (errorOutputContainer.errors = [])).push(diag);
                        }
                    }
                }
                else {
                    if (nonArrayLikeTargetParts !== typeChecker.neverType) {
                        const child = validChildren[0];
                        const elem = getElaborationElementForJsxChild(child, childrenNameType, getInvalidTextualChildDiagnostic);
                        if (elem) {
                            result = typeChecker.elaborateElementwise(
                                (function*() { yield elem; })(),
                                source,
                                target,
                                relation,
                                containingMessageChain,
                                errorOutputContainer
                            ) || result;
                        }
                    }
                    else if (!typeChecker.isTypeRelatedTo(typeChecker.getIndexedAccessType(source, childrenNameType, /*noUncheckedIndexedAccessCandidate*/ undefined, /*accessNode*/ undefined, /*aliasSymbol*/ undefined, /*aliasTypeArguments*/ undefined, /*accessFlags*/ AccessFlags.None), childrenTargetType, relation)) {
                        // arity mismatch
                        result = true;
                        const diag = typeChecker.error(
                            containingElement.openingElement.tagName,
                            Diagnostics.This_JSX_tag_s_0_prop_expects_type_1_which_requires_multiple_children_but_only_a_single_child_was_provided,
                            childrenPropName,
                            typeChecker.typeToString(childrenTargetType, /*enclosingDeclaration*/ undefined, /*flags*/ TypeFormatFlags.AllowUniqueESSymbolType | TypeFormatFlags.UseAliasDefinedOutsideCurrentScope, /*writer*/ createTextWriter(""))
                        );
                        if (errorOutputContainer && errorOutputContainer.skipLogging) {
                            (errorOutputContainer.errors || (errorOutputContainer.errors = [])).push(diag);
                        }
                    }
                }
            }
            return result;

            function getInvalidTextualChildDiagnostic() {
                if (!invalidTextDiagnostic) {
                    const tagNameText = getTextOfNode(node.parent.tagName);
                    const childPropName = getJsxElementChildrenPropertyName(getJsxNamespaceAt(node));
                    const childrenPropName = childPropName === undefined ? "children" : unescapeLeadingUnderscores(childPropName);
                    const childrenTargetType = typeChecker.getIndexedAccessType(target, typeChecker.getLiteralType(childrenPropName), /*noUncheckedIndexedAccessCandidate*/ undefined, /*accessNode*/ undefined, /*aliasSymbol*/ undefined, /*aliasTypeArguments*/ undefined, /*accessFlags*/ AccessFlags.None);
                    const diagnostic = Diagnostics._0_components_don_t_accept_text_as_child_elements_Text_in_JSX_has_the_type_string_but_the_expected_type_of_1_is_2;
                    invalidTextDiagnostic = { ...diagnostic, key: "!!ALREADY FORMATTED!!", message: formatMessage(/*_dummy*/ undefined, diagnostic, tagNameText, childrenPropName, typeChecker.typeToString(childrenTargetType, /*enclosingDeclaration*/ undefined, /*flags*/ TypeFormatFlags.AllowUniqueESSymbolType | TypeFormatFlags.UseAliasDefinedOutsideCurrentScope, /*writer*/ createTextWriter(""))) };
                }
                return invalidTextDiagnostic;
            }
        }

        function reportErrorResultsDoNotReport(target: Type, errorNode: Node | undefined): boolean {
            const targetTypes = (target as IntersectionType).types;
            const intrinsicAttributes = getJsxType(JsxNames.IntrinsicAttributes, errorNode);
            const intrinsicClassAttributes = getJsxType(JsxNames.IntrinsicClassAttributes, errorNode);
            return intrinsicAttributes !== typeChecker.errorType && intrinsicClassAttributes !== typeChecker.errorType &&
                    (contains(targetTypes, intrinsicAttributes) || contains(targetTypes, intrinsicClassAttributes));
        }


        //----------------------------
        // Checker internals
        //----------------------------

        function getJsxNamespace(location: Node | undefined): __String {
            if (location) {
                const file = getSourceFileOfNode(location);
                if (file) {
                    if (isJsxOpeningFragment(location)) {
                        if (file.localJsxFragmentNamespace) {
                            return file.localJsxFragmentNamespace;
                        }
                        const jsxFragmentPragma = file.pragmas.get("jsxfrag");
                        if (jsxFragmentPragma) {
                            const chosenPragma = isArray(jsxFragmentPragma) ? jsxFragmentPragma[0] : jsxFragmentPragma;
                            file.localJsxFragmentFactory = parseIsolatedEntityName(chosenPragma.arguments.factory, typeChecker.languageVersion);
                            visitNode(file.localJsxFragmentFactory, jsxutil.markAsSynthetic);
                            if (file.localJsxFragmentFactory) {
                                return file.localJsxFragmentNamespace = getFirstIdentifier(file.localJsxFragmentFactory).escapedText;
                            }
                        }
                        const entity = getJsxFragmentFactoryEntity(location);
                        if (entity) {
                            file.localJsxFragmentFactory = entity;
                            return file.localJsxFragmentNamespace = getFirstIdentifier(entity).escapedText;
                        }
                    }
                    else {
                        if (file.localJsxNamespace) {
                            return file.localJsxNamespace;
                        }
                        const jsxPragma = file.pragmas.get("jsx");
                        if (jsxPragma) {
                            const chosenPragma = isArray(jsxPragma) ? jsxPragma[0] : jsxPragma;
                            file.localJsxFactory = parseIsolatedEntityName(chosenPragma.arguments.factory, typeChecker.languageVersion);
                            visitNode(file.localJsxFactory, jsxutil.markAsSynthetic);
                            if (file.localJsxFactory) {
                                return file.localJsxNamespace = getFirstIdentifier(file.localJsxFactory).escapedText;
                            }
                        }
                    }
                }
            }
            if (!_jsxNamespace) {
                _jsxNamespace = "React" as __String;
                if (typeChecker.compilerOptions.jsxFactory) {
                    _jsxFactoryEntity = parseIsolatedEntityName(typeChecker.compilerOptions.jsxFactory, typeChecker.languageVersion);
                    visitNode(_jsxFactoryEntity, jsxutil.markAsSynthetic);
                    if (_jsxFactoryEntity) {
                        _jsxNamespace = getFirstIdentifier(_jsxFactoryEntity).escapedText;
                    }
                }
                else if (typeChecker.compilerOptions.reactNamespace) {
                    _jsxNamespace = escapeLeadingUnderscores(typeChecker.compilerOptions.reactNamespace);
                }
            }
            if (!_jsxFactoryEntity) {
                _jsxFactoryEntity = factory.createQualifiedName(factory.createIdentifier(unescapeLeadingUnderscores(_jsxNamespace)), "createElement");
            }
            return _jsxNamespace;
        }

        function *generateJsxAttributes(node: JsxAttributes): ElaborationIterator {
            if (!length(node.properties)) return;
            for (const prop of node.properties) {
                if (isJsxSpreadAttribute(prop)) continue;
                yield { errorNode: prop.name, innerExpression: prop.initializer, nameType: typeChecker.getLiteralType(idText(prop.name)) };
            }
        }

        function *generateJsxChildren(node: JsxElement, getInvalidTextDiagnostic: () => DiagnosticMessage): ElaborationIterator {
            if (!length(node.children)) return;
            let memberOffset = 0;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const nameType = typeChecker.getLiteralType(i - memberOffset);
                const elem = getElaborationElementForJsxChild(child, nameType, getInvalidTextDiagnostic);
                if (elem) {
                    yield elem;
                }
                else {
                    memberOffset++;
                }
            }
        }

        function getElaborationElementForJsxChild(child: JsxChild, nameType: LiteralType, getInvalidTextDiagnostic: () => DiagnosticMessage) {
            switch (child.kind) {
                case SyntaxKind.JsxExpression:
                    // child is of the type of the expression
                    return { errorNode: child, innerExpression: child.expression, nameType };
                case SyntaxKind.JsxText:
                    if (child.containsOnlyTriviaWhiteSpaces) {
                        break; // Whitespace only jsx text isn't real jsx text
                    }
                    // child is a string
                    return { errorNode: child, innerExpression: undefined, nameType, errorMessage: getInvalidTextDiagnostic() };
                case SyntaxKind.JsxElement:
                case SyntaxKind.JsxSelfClosingElement:
                case SyntaxKind.JsxFragment:
                    // child is of type JSX.Element
                    return { errorNode: child, innerExpression: child, nameType };
                default:
                    return Debug.assertNever(child, "Found invalid jsx child");
            }
        }

        function getJsxPropsTypeFromCallSignature(sig: Signature, context: JsxOpeningLikeElement) {
            let propsType = typeChecker.getTypeOfFirstParameterOfSignatureWithFallback(sig, typeChecker.unknownType);
            propsType = getJsxManagedAttributesFromLocatedAttributes(context, getJsxNamespaceAt(context), propsType);
            const intrinsicAttribs = getJsxType(JsxNames.IntrinsicAttributes, context);
            if (intrinsicAttribs !== typeChecker.errorType) {
                propsType = typeChecker.intersectTypes(intrinsicAttribs, propsType);
            }
            return propsType;
        }

        function getJsxPropsTypeForSignatureFromMember(sig: Signature, forcedLookupLocation: __String) {
            if (sig.compositeSignatures) {
                // JSX Elements using the legacy `props`-field based lookup (eg, react class components) need to treat the `props` member as an input
                // instead of an output position when resolving the signature. We need to go back to the input signatures of the composite signature,
                // get the type of `props` on each return type individually, and then _intersect them_, rather than union them (as would normally occur
                // for a union signature). It's an unfortunate quirk of looking in the output of the signature for the type we want to use for the input.
                // The default behavior of `getTypeOfFirstParameterOfSignatureWithFallback` when no `props` member name is defined is much more sane.
                const results: Type[] = [];
                for (const signature of sig.compositeSignatures) {
                    const instance = typeChecker.getReturnTypeOfSignature(signature);
                    if (typeChecker.isTypeAny(instance)) {
                        return instance;
                    }
                    const propType = typeChecker.getTypeOfPropertyOfType(instance, forcedLookupLocation);
                    if (!propType) {
                        return;
                    }
                    results.push(propType);
                }
                return typeChecker.getIntersectionType(results); // Same result for both union and intersection signatures
            }
            const instanceType = typeChecker.getReturnTypeOfSignature(sig);
            return typeChecker.isTypeAny(instanceType) ? instanceType : typeChecker.getTypeOfPropertyOfType(instanceType, forcedLookupLocation);
        }

        function getStaticTypeOfReferencedJsxConstructor(context: JsxOpeningLikeElement) {
            if (jsxutil.isJsxIntrinsicIdentifier(context.tagName)) {
                const result = getIntrinsicAttributesTypeFromJsxOpeningLikeElement(context);
                const fakeSignature = createSignatureForJSXIntrinsic(context, result);
                return typeChecker.getOrCreateTypeFromSignature(fakeSignature);
            }
            const tagType = typeChecker.checkExpressionCached(context.tagName);
            if (tagType.flags & TypeFlags.StringLiteral) {
                const result = getIntrinsicAttributesTypeFromStringLiteralType(tagType as StringLiteralType, context);
                if (!result) {
                    return typeChecker.errorType;
                }
                const fakeSignature = createSignatureForJSXIntrinsic(context, result);
                return typeChecker.getOrCreateTypeFromSignature(fakeSignature);
            }
            return tagType;
        }

        function getJsxManagedAttributesFromLocatedAttributes(context: JsxOpeningLikeElement, ns: Symbol, attributesType: Type) {
            const managedSym = getJsxLibraryManagedAttributes(ns);
            if (managedSym) {
                const declaredManagedType = typeChecker.getDeclaredTypeOfSymbol(managedSym); // fetches interface type, or initializes symbol links type parmaeters
                const ctorType = getStaticTypeOfReferencedJsxConstructor(context);
                if (managedSym.flags & SymbolFlags.TypeAlias) {
                    const params = typeChecker.getSymbolLinks(managedSym).typeParameters;
                    if (length(params) >= 2) {
                        const args = typeChecker.fillMissingTypeArguments([ctorType, attributesType], params, 2, isInJSFile(context));
                        return typeChecker.getTypeAliasInstantiation(managedSym, args);
                    }
                }
                if (length((declaredManagedType as GenericType).typeParameters) >= 2) {
                    const args = typeChecker.fillMissingTypeArguments([ctorType, attributesType], (declaredManagedType as GenericType).typeParameters, 2, isInJSFile(context));
                    return typeChecker.createTypeReference((declaredManagedType as GenericType), args);
                }
            }
            return attributesType;
        }

        function getJsxPropsTypeFromClassType(sig: Signature, context: JsxOpeningLikeElement) {
            const ns = getJsxNamespaceAt(context);
            const forcedLookupLocation = getJsxElementPropertiesName(ns);
            let attributesType = forcedLookupLocation === undefined
                // If there is no type ElementAttributesProperty, return the type of the first parameter of the signature, which should be the props type
                ? typeChecker.getTypeOfFirstParameterOfSignatureWithFallback(sig, typeChecker.unknownType)
                : forcedLookupLocation === ""
                    // If there is no e.g. 'props' member in ElementAttributesProperty, use the element class type instead
                    ? typeChecker.getReturnTypeOfSignature(sig)
                    // Otherwise get the type of the property on the signature return type
                    : getJsxPropsTypeForSignatureFromMember(sig, forcedLookupLocation);

            if (!attributesType) {
                // There is no property named 'props' on this instance type
                if (!!forcedLookupLocation && !!length(context.attributes.properties)) {
                    typeChecker.error(context, Diagnostics.JSX_element_class_does_not_support_attributes_because_it_does_not_have_a_0_property, unescapeLeadingUnderscores(forcedLookupLocation));
                }
                return typeChecker.unknownType;
            }

            attributesType = getJsxManagedAttributesFromLocatedAttributes(context, ns, attributesType);

            if (typeChecker.isTypeAny(attributesType)) {
                // Props is of type 'any' or unknown
                return attributesType;
            }
            else {
                // Normal case -- add in IntrinsicClassElements<T> and IntrinsicElements
                let apparentAttributesType = attributesType;
                const intrinsicClassAttribs = getJsxType(JsxNames.IntrinsicClassAttributes, context);
                if (intrinsicClassAttribs !== typeChecker.errorType) {
                    const typeParams = typeChecker.getLocalTypeParametersOfClassOrInterfaceOrTypeAlias(intrinsicClassAttribs.symbol);
                    const hostClassType = typeChecker.getReturnTypeOfSignature(sig);
                    apparentAttributesType = typeChecker.intersectTypes(
                        typeParams
                            ? typeChecker.createTypeReference(<GenericType>intrinsicClassAttribs, typeChecker.fillMissingTypeArguments([hostClassType], typeParams, typeChecker.getMinTypeArgumentCount(typeParams), isInJSFile(context)))
                            : intrinsicClassAttribs,
                        apparentAttributesType
                    );
                }

                const intrinsicAttribs = getJsxType(JsxNames.IntrinsicAttributes, context);
                if (intrinsicAttribs !== typeChecker.errorType) {
                    apparentAttributesType = typeChecker.intersectTypes(intrinsicAttribs, apparentAttributesType);
                }

                return apparentAttributesType;
            }
        }

        /**
         * Get attributes type of the JSX opening-like element. The result is from resolving "attributes" property of the opening-like element.
         *
         * @param openingLikeElement a JSX opening-like element
         * @param filter a function to remove attributes that will not participate in checking whether attributes are assignable
         * @return an anonymous type (similar to the one returned by checkObjectLiteral) in which its properties are attributes property.
         * @remarks Because this function calls getSpreadType, it needs to use the same checks as checkObjectLiteral,
         * which also calls getSpreadType.
         */
        function createJsxAttributesTypeFromAttributesProperty(openingLikeElement: JsxOpeningLikeElement, checkMode: CheckMode | undefined) {
            const attributes = openingLikeElement.attributes;
            const allAttributesTable = typeChecker.strictNullChecks ? createSymbolTable() : undefined;
            let attributesTable = createSymbolTable();
            let spread: Type = typeChecker.emptyJsxObjectType;
            let hasSpreadAnyType = false;
            let typeToIntersect: Type | undefined;
            let explicitlySpecifyChildrenAttribute = false;
            let objectFlags: ObjectFlags = ObjectFlags.JsxAttributes;
            const jsxChildrenPropertyName = getJsxElementChildrenPropertyName(getJsxNamespaceAt(openingLikeElement));

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
                    if (attributeDecl.name.escapedText === jsxChildrenPropertyName) {
                        explicitlySpecifyChildrenAttribute = true;
                    }
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

            // Handle children attribute
            const parent = openingLikeElement.parent.kind === SyntaxKind.JsxElement ? openingLikeElement.parent as JsxElement : undefined;
            // We have to check that openingElement of the parent is the one we are visiting as this may not be true for selfClosingElement
            if (parent && parent.openingElement === openingLikeElement && parent.children.length > 0) {
                const childrenTypes: Type[] = checkJsxChildren(parent, checkMode);

                if (!hasSpreadAnyType && jsxChildrenPropertyName && jsxChildrenPropertyName !== "") {
                    // Error if there is a attribute named "children" explicitly specified and children element.
                    // This is because children element will overwrite the value from attributes.
                    // Note: we will not warn "children" attribute overwritten if "children" attribute is specified in object spread.
                    if (explicitlySpecifyChildrenAttribute) {
                        typeChecker.error(attributes, Diagnostics._0_are_specified_twice_The_attribute_named_0_will_be_overwritten, unescapeLeadingUnderscores(jsxChildrenPropertyName));
                    }

                    const contextualType = typeChecker.getApparentTypeOfContextualType(openingLikeElement.attributes);
                    const childrenContextualType = contextualType && typeChecker.getTypeOfPropertyOfContextualType(contextualType, jsxChildrenPropertyName);
                    // If there are children in the body of JSX element, create dummy attribute "children" with the union of children types so that it will pass the attribute checking process
                    const childrenPropSymbol = typeChecker.createSymbol(SymbolFlags.Property, jsxChildrenPropertyName);
                    childrenPropSymbol.type = childrenTypes.length === 1 ? childrenTypes[0] :
                        childrenContextualType && typeChecker.someType(childrenContextualType, typeChecker.isTupleLikeType) ? typeChecker.createTupleType(childrenTypes, /*elementFlags*/ undefined, /*readonly*/ false, /*namedMemberDeclarations*/ undefined) :
                        typeChecker.createArrayType(typeChecker.getUnionType(childrenTypes, /*unionReduction*/ UnionReduction.Literal));
                    // Fake up a property declaration for the children
                    childrenPropSymbol.valueDeclaration = factory.createPropertySignature(/*modifiers*/ undefined, unescapeLeadingUnderscores(jsxChildrenPropertyName), /*questionToken*/ undefined, /*type*/ undefined);
                    setParent(childrenPropSymbol.valueDeclaration, attributes);
                    childrenPropSymbol.valueDeclaration.symbol = childrenPropSymbol;
                    const childPropMap = createSymbolTable();
                    childPropMap.set(jsxChildrenPropertyName, childrenPropSymbol);
                    spread = typeChecker.getSpreadType(spread, typeChecker.createAnonymousType(attributes.symbol, childPropMap, emptyArray, emptyArray, /*stringIndexInfo*/ undefined, /*numberIndexInfo*/ undefined),
                        attributes.symbol, objectFlags, /*readonly*/ false);

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

        function checkJsxChildren(node: JsxElement | JsxFragment, checkMode?: CheckMode) {
            const childrenTypes: Type[] = [];
            for (const child of node.children) {
                // In React, JSX text that contains only whitespaces will be ignored so we don't want to type-check that
                // because then type of children property will have constituent of string type.
                if (child.kind === SyntaxKind.JsxText) {
                    if (!child.containsOnlyTriviaWhiteSpaces) {
                        childrenTypes.push(typeChecker.stringType);
                    }
                }
                else if (child.kind === SyntaxKind.JsxExpression && !child.expression) {
                    continue; // empty jsx expressions don't *really* count as present children
                }
                else {
                    childrenTypes.push(typeChecker.checkExpressionForMutableLocation(child, checkMode));
                }
            }
            return childrenTypes;
        }

        function getJsxType(name: __String, location: Node | undefined) {
            const namespace = getJsxNamespaceAt(location);
            const exports = namespace && typeChecker.getExportsOfSymbol(namespace);
            const typeSymbol = exports && typeChecker.getSymbol(exports, name, SymbolFlags.Type);
            return typeSymbol ? typeChecker.getDeclaredTypeOfSymbol(typeSymbol) : typeChecker.errorType;
        }

        function getJsxNamespaceContainerForImplicitImport(location: Node | undefined): Symbol | undefined {
            const file = location && getSourceFileOfNode(location);
            const links = file && typeChecker.getNodeLinks(file);
            if (links && links.jsxImplicitImportContainer === false) {
                return undefined;
            }
            if (links && links.jsxImplicitImportContainer) {
                return links.jsxImplicitImportContainer;
            }
            const runtimeImportSpecifier = getJSXRuntimeImport(getJSXImplicitImportBase(typeChecker.compilerOptions, file), typeChecker.compilerOptions);
            if (!runtimeImportSpecifier) {
                return undefined;
            }
            const isClassic = getEmitModuleResolutionKind(typeChecker.compilerOptions) === ModuleResolutionKind.Classic;
            const errorMessage = isClassic
                                    ? Diagnostics.Cannot_find_module_0_Did_you_mean_to_set_the_moduleResolution_option_to_node_or_to_add_aliases_to_the_paths_option
                                    : Diagnostics.Cannot_find_module_0_or_its_corresponding_type_declarations;
            const mod = typeChecker.resolveExternalModule(location!, runtimeImportSpecifier, errorMessage, location!, /*isForAugmentation*/ false);
            const result = mod && mod !== typeChecker.unknownSymbol ? typeChecker.getMergedSymbol(typeChecker.resolveSymbol(mod)) : undefined;
            if (links) {
                links.jsxImplicitImportContainer = result || false;
            }
            return result;
        }

        function getJsxNamespaceAt(location: Node | undefined): Symbol {
            const links = location && typeChecker.getNodeLinks(location);
            if (links && links.jsxNamespace) {
                return links.jsxNamespace;
            }
            if (!links || links.jsxNamespace !== false) {
                let resolvedNamespace = getJsxNamespaceContainerForImplicitImport(location);

                if (!resolvedNamespace || resolvedNamespace === typeChecker.unknownSymbol) {
                    const namespaceName = getJsxNamespace(location);
                    resolvedNamespace = typeChecker.resolveName(location, namespaceName, SymbolFlags.Namespace, /*diagnosticMessage*/ undefined, namespaceName, /*isUse*/ false, /*excludeGlobals*/ false);
                }

                if (resolvedNamespace) {
                    const candidate = typeChecker.resolveSymbol(typeChecker.getSymbol(typeChecker.getExportsOfSymbol(typeChecker.resolveSymbol(resolvedNamespace)), JsxNames.JSX, SymbolFlags.Namespace));
                    if (candidate && candidate !== typeChecker.unknownSymbol) {
                        if (links) {
                            links.jsxNamespace = candidate;
                        }
                        return candidate;
                    }
                }
                if (links) {
                    links.jsxNamespace = false;
                }
            }
            // JSX global fallback
            const s = typeChecker.resolveSymbol(typeChecker.getGlobalSymbol(JsxNames.JSX, SymbolFlags.Namespace, /*diagnosticMessage*/ undefined));
            if (s === typeChecker.unknownSymbol) {
                return undefined!; // TODO: GH#18217
            }
            return s!; // TODO: GH#18217
        }

        /**
         * Look into JSX namespace and then look for container with matching name as nameOfAttribPropContainer.
         * Get a single property from that container if existed. Report an error if there are more than one property.
         *
         * @param nameOfAttribPropContainer a string of value JsxNames.ElementAttributesPropertyNameContainer or JsxNames.ElementChildrenAttributeNameContainer
         *          if other string is given or the container doesn't exist, return undefined.
         */
        function getNameFromJsxElementAttributesContainer(nameOfAttribPropContainer: __String, jsxNamespace: Symbol): __String | undefined {
            // JSX.ElementAttributesProperty | JSX.ElementChildrenAttribute [symbol]
            const jsxElementAttribPropInterfaceSym = jsxNamespace && typeChecker.getSymbol(jsxNamespace.exports!, nameOfAttribPropContainer, SymbolFlags.Type);
            // JSX.ElementAttributesProperty | JSX.ElementChildrenAttribute [type]
            const jsxElementAttribPropInterfaceType = jsxElementAttribPropInterfaceSym && typeChecker.getDeclaredTypeOfSymbol(jsxElementAttribPropInterfaceSym);
            // The properties of JSX.ElementAttributesProperty | JSX.ElementChildrenAttribute
            const propertiesOfJsxElementAttribPropInterface = jsxElementAttribPropInterfaceType && typeChecker.getPropertiesOfType(jsxElementAttribPropInterfaceType);
            if (propertiesOfJsxElementAttribPropInterface) {
                // Element Attributes has zero properties, so the element attributes type will be the class instance type
                if (propertiesOfJsxElementAttribPropInterface.length === 0) {
                    return "" as __String;
                }
                // Element Attributes has one property, so the element attributes type will be the type of the corresponding
                // property of the class instance type
                else if (propertiesOfJsxElementAttribPropInterface.length === 1) {
                    return propertiesOfJsxElementAttribPropInterface[0].escapedName;
                }
                else if (propertiesOfJsxElementAttribPropInterface.length > 1 && jsxElementAttribPropInterfaceSym!.declarations) {
                    // More than one property on ElementAttributesProperty is an error
                    typeChecker.error(jsxElementAttribPropInterfaceSym!.declarations[0], Diagnostics.The_global_type_JSX_0_may_not_have_more_than_one_property, unescapeLeadingUnderscores(nameOfAttribPropContainer));
                }
            }
            return undefined;
        }

        function getJsxLibraryManagedAttributes(jsxNamespace: Symbol) {
            // JSX.LibraryManagedAttributes [symbol]
            return jsxNamespace && typeChecker.getSymbol(jsxNamespace.exports!, JsxNames.LibraryManagedAttributes, SymbolFlags.Type);
        }

        /// e.g. "props" for React.d.ts,
        /// or 'undefined' if ElementAttributesProperty doesn't exist (which means all
        ///     non-intrinsic elements' attributes type is 'any'),
        /// or '' if it has 0 properties (which means every
        ///     non-intrinsic elements' attributes type is the element instance type)
        function getJsxElementPropertiesName(jsxNamespace: Symbol) {
            return getNameFromJsxElementAttributesContainer(JsxNames.ElementAttributesPropertyNameContainer, jsxNamespace);
        }

        function getJsxElementChildrenPropertyName(jsxNamespace: Symbol): __String | undefined {
            return getNameFromJsxElementAttributesContainer(JsxNames.ElementChildrenAttributeNameContainer, jsxNamespace);
        }

        function getUninstantiatedJsxSignaturesOfType(elementType: Type, caller: JsxOpeningLikeElement): readonly Signature[] {
            if (elementType.flags & TypeFlags.String) {
                return [typeChecker.anySignature];
            }
            else if (elementType.flags & TypeFlags.StringLiteral) {
                const intrinsicType = getIntrinsicAttributesTypeFromStringLiteralType(elementType as StringLiteralType, caller);
                if (!intrinsicType) {
                    typeChecker.error(caller, Diagnostics.Property_0_does_not_exist_on_type_1, (elementType as StringLiteralType).value, "JSX." + JsxNames.IntrinsicElements);
                    return emptyArray;
                }
                else {
                    const fakeSignature = createSignatureForJSXIntrinsic(caller, intrinsicType);
                    return [fakeSignature];
                }
            }
            const apparentElemType = typeChecker.getApparentType(elementType);
            // Resolve the signatures, preferring constructor
            let signatures = typeChecker.getSignaturesOfType(apparentElemType, SignatureKind.Construct);
            if (signatures.length === 0) {
                // No construct signatures, try call signatures
                signatures = typeChecker.getSignaturesOfType(apparentElemType, SignatureKind.Call);
            }
            if (signatures.length === 0 && apparentElemType.flags & TypeFlags.Union) {
                // If each member has some combination of new/call signatures; make a union signature list for those
                signatures = typeChecker.getUnionSignatures(map((apparentElemType as UnionType).types, t => getUninstantiatedJsxSignaturesOfType(t, caller)));
            }
            return signatures;
        }

        function getIntrinsicAttributesTypeFromStringLiteralType(type: StringLiteralType, location: Node): Type | undefined {
            // If the elemType is a stringLiteral type, we can then provide a check to make sure that the string literal type is one of the Jsx intrinsic element type
            // For example:
            //      var CustomTag: "h1" = "h1";
            //      <CustomTag> Hello World </CustomTag>
            const intrinsicElementsType = getJsxType(JsxNames.IntrinsicElements, location);
            if (intrinsicElementsType !== typeChecker.errorType) {
                const stringLiteralTypeName = type.value;
                const intrinsicProp = typeChecker.getPropertyOfType(intrinsicElementsType, escapeLeadingUnderscores(stringLiteralTypeName));
                if (intrinsicProp) {
                    return typeChecker.getTypeOfSymbol(intrinsicProp);
                }
                const indexSignatureType = typeChecker.getIndexTypeOfType(intrinsicElementsType, IndexKind.String);
                if (indexSignatureType) {
                    return indexSignatureType;
                }
                return undefined;
            }
            // If we need to report an error, we already done so here. So just return any to prevent any more error downstream
            return typeChecker.anyType;
        }

        function checkJsxReturnAssignableToAppropriateBound(refKind: JsxReferenceKind, elemInstanceType: Type, openingLikeElement: JsxOpeningLikeElement) {
            if (refKind === JsxReferenceKind.Function) {
                const sfcReturnConstraint = getJsxStatelessElementTypeAt(openingLikeElement);
                if (sfcReturnConstraint) {
                    typeChecker.checkTypeRelatedTo(elemInstanceType, sfcReturnConstraint, typeChecker.assignableRelation, openingLikeElement.tagName, Diagnostics.Its_return_type_0_is_not_a_valid_JSX_element, generateInitialErrorChain);
                }
            }
            else if (refKind === JsxReferenceKind.Component) {
                const classConstraint = getJsxElementClassTypeAt(openingLikeElement);
                if (classConstraint) {
                    // Issue an error if this return type isn't assignable to JSX.ElementClass, failing that
                    typeChecker.checkTypeRelatedTo(elemInstanceType, classConstraint, typeChecker.assignableRelation, openingLikeElement.tagName, Diagnostics.Its_instance_type_0_is_not_a_valid_JSX_element, generateInitialErrorChain);
                }
            }
            else { // Mixed
                const sfcReturnConstraint = getJsxStatelessElementTypeAt(openingLikeElement);
                const classConstraint = getJsxElementClassTypeAt(openingLikeElement);
                if (!sfcReturnConstraint || !classConstraint) {
                    return;
                }
                const combined = typeChecker.getUnionType([sfcReturnConstraint, classConstraint], /*unionReduction*/ UnionReduction.Literal);
                typeChecker.checkTypeRelatedTo(elemInstanceType, combined, typeChecker.assignableRelation, openingLikeElement.tagName, Diagnostics.Its_element_type_0_is_not_a_valid_JSX_element, generateInitialErrorChain);
            }

            function generateInitialErrorChain(): DiagnosticMessageChain {
                const componentName = getTextOfNode(openingLikeElement.tagName);
                return chainDiagnosticMessages(/* details */ undefined, Diagnostics._0_cannot_be_used_as_a_JSX_component, componentName);
            }
        }

        /**
         * Get attributes type of the given intrinsic opening-like Jsx element by resolving the tag name.
         * The function is intended to be called from a function which has checked that the opening element is an intrinsic element.
         * @param node an intrinsic JSX opening-like element
         */
        function getIntrinsicAttributesTypeFromJsxOpeningLikeElement(node: JsxOpeningLikeElement): Type {
            Debug.assert(jsxutil.isJsxIntrinsicIdentifier(node.tagName));
            const links = typeChecker.getNodeLinks(node);
            if (!links.resolvedJsxElementAttributesType) {
                const symbol = getIntrinsicTagSymbol(node);
                if (links.jsxFlags & JsxFlags.IntrinsicNamedElement) {
                    return links.resolvedJsxElementAttributesType = typeChecker.getTypeOfSymbol(symbol) || typeChecker.errorType;
                }
                else if (links.jsxFlags & JsxFlags.IntrinsicIndexedElement) {
                    return links.resolvedJsxElementAttributesType =
                        typeChecker.getIndexTypeOfType(getJsxType(JsxNames.IntrinsicElements, node), IndexKind.String) || typeChecker.errorType;
                }
                else {
                    return links.resolvedJsxElementAttributesType = typeChecker.errorType;
                }
            }
            return links.resolvedJsxElementAttributesType;
        }

        function getJsxElementClassTypeAt(location: Node): Type | undefined {
            const type = getJsxType(JsxNames.ElementClass, location);
            if (type === typeChecker.errorType) return undefined;
            return type;
        }

        function getJsxElementTypeAt(location: Node): Type {
            return getJsxType(JsxNames.Element, location);
        }

        function getJsxStatelessElementTypeAt(location: Node): Type | undefined {
            const jsxElementType = getJsxElementTypeAt(location);
            if (jsxElementType) {
                return typeChecker.getUnionType([jsxElementType, typeChecker.nullType], /*unionReduction*/ UnionReduction.Literal);
            }
        }

        function checkJsxPreconditions(node: Node) {
            // Preconditions for using JSX
            if ((typeChecker.compilerOptions.jsx || JsxEmit.None) === JsxEmit.None) {
                typeChecker.error(node, Diagnostics.Cannot_use_JSX_unless_the_jsx_flag_is_provided);
            }

            if (getJsxElementTypeAt(node) === undefined) {
                if (typeChecker.noImplicitAny) {
                    typeChecker.error(node, Diagnostics.JSX_element_implicitly_has_type_any_because_the_global_type_JSX_Element_does_not_exist);
                }
            }

            if (!getJsxNamespaceContainerForImplicitImport(node)) {
                // The reactNamespace/jsxFactory's root symbol should be marked as 'used' so we don't incorrectly elide its import.
                // And if there is no reactNamespace/jsxFactory's symbol in scope when targeting React emit, we should issue an error.
                const jsxFactoryRefErr = typeChecker.diagnostics && typeChecker.compilerOptions.jsx === JsxEmit.React ? Diagnostics.Cannot_find_name_0 : undefined;
                const jsxFactoryNamespace = getJsxNamespace(node);
                const jsxFactoryLocation = isJsxOpeningLikeElement(node) ? node.tagName : node;

                // allow null as jsxFragmentFactory
                let jsxFactorySym: Symbol | undefined;
                if (!(isJsxOpeningFragment(node) && jsxFactoryNamespace === "null")) {
                    jsxFactorySym = typeChecker.resolveName(jsxFactoryLocation, jsxFactoryNamespace, SymbolFlags.Value, jsxFactoryRefErr, jsxFactoryNamespace, /*isUse*/ true, /*excludeGlobals*/ false);
                }

                if (jsxFactorySym) {
                    // Mark local symbol as referenced here because it might not have been marked
                    // if jsx emit was not jsxFactory as there wont be error being emitted
                    jsxFactorySym.isReferenced = SymbolFlags.All;

                    // If react/jsxFactory symbol is alias, mark it as refereced
                    if (jsxFactorySym.flags & SymbolFlags.Alias && !typeChecker.getTypeOnlyAliasDeclaration(jsxFactorySym)) {
                        typeChecker.markAliasSymbolAsReferenced(jsxFactorySym);
                    }
                }
            }
        }

        function getJsxReferenceKind(node: JsxOpeningLikeElement): JsxReferenceKind {
            if (jsxutil.isJsxIntrinsicIdentifier(node.tagName)) {
                return JsxReferenceKind.Mixed;
            }
            const tagType = typeChecker.getApparentType(typeChecker.checkExpression(node.tagName));
            if (length(typeChecker.getSignaturesOfType(tagType, SignatureKind.Construct))) {
                return JsxReferenceKind.Component;
            }
            if (length(typeChecker.getSignaturesOfType(tagType, SignatureKind.Call))) {
                return JsxReferenceKind.Function;
            }
            return JsxReferenceKind.Mixed;
        }

        function createSignatureForJSXIntrinsic(node: JsxOpeningLikeElement, result: Type): Signature {
            const namespace = getJsxNamespaceAt(node);
            const exports = namespace && typeChecker.getExportsOfSymbol(namespace);
            // We fake up a SFC signature for each intrinsic, however a more specific per-element signature drawn from the JSX declaration
            // file would probably be preferable.
            const typeSymbol = exports && typeChecker.getSymbol(exports, JsxNames.Element, SymbolFlags.Type);
            const returnNode = typeSymbol && typeChecker.nodeBuilder.symbolToEntityName(typeSymbol, SymbolFlags.Type, node);
            const declaration = factory.createFunctionTypeNode(/*typeParameters*/ undefined,
                [factory.createParameterDeclaration(/*decorators*/ undefined, /*modifiers*/ undefined, /*dotdotdot*/ undefined, "props", /*questionMark*/ undefined, typeChecker.nodeBuilder.typeToTypeNode(result, node))],
                returnNode ? factory.createTypeReferenceNode(returnNode, /*typeArguments*/ undefined) : factory.createKeywordTypeNode(SyntaxKind.AnyKeyword)
            );
            const parameterSymbol = typeChecker.createSymbol(SymbolFlags.FunctionScopedVariable, "props" as __String);
            parameterSymbol.type = result;
            return typeChecker.createSignature(
                declaration,
                /*typeParameters*/ undefined,
                /*thisParameter*/ undefined,
                [parameterSymbol],
                typeSymbol ? typeChecker.getDeclaredTypeOfSymbol(typeSymbol) : typeChecker.errorType,
                /*returnTypePredicate*/ undefined,
                1,
                SignatureFlags.None
            );
        }

        function getJsxFactoryEntity(location: Node): EntityName | undefined {
            return location ? (getJsxNamespace(location), (getSourceFileOfNode(location).localJsxFactory || _jsxFactoryEntity)) : _jsxFactoryEntity;
        }

        function getJsxFragmentFactoryEntity(location: Node): EntityName | undefined {
            if (location) {
                const file = getSourceFileOfNode(location);
                if (file) {
                    if (file.localJsxFragmentFactory) {
                        return file.localJsxFragmentFactory;
                    }
                    const jsxFragPragmas = file.pragmas.get("jsxfrag");
                    const jsxFragPragma = isArray(jsxFragPragmas) ? jsxFragPragmas[0] : jsxFragPragmas;
                    if (jsxFragPragma) {
                        file.localJsxFragmentFactory = parseIsolatedEntityName(jsxFragPragma.arguments.factory, typeChecker.languageVersion);
                        return file.localJsxFragmentFactory;
                    }
                }
            }

            if (typeChecker.compilerOptions.jsxFragmentFactory) {
                return parseIsolatedEntityName(typeChecker.compilerOptions.jsxFragmentFactory, typeChecker.languageVersion);
            }
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
                        getJsxFactoryEntity(currentSourceFile),
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
                    getJsxFactoryEntity(currentSourceFile),
                    getJsxFragmentFactoryEntity(currentSourceFile),
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

    namespace JsxNames {
        export const JSX = "JSX" as __String;
        export const IntrinsicElements = "IntrinsicElements" as __String;
        export const ElementClass = "ElementClass" as __String;
        export const ElementAttributesPropertyNameContainer = "ElementAttributesProperty" as __String; // TODO: Deprecate and remove support
        export const ElementChildrenAttributeNameContainer = "ElementChildrenAttribute" as __String;
        export const Element = "Element" as __String;
        export const IntrinsicAttributes = "IntrinsicAttributes" as __String;
        export const IntrinsicClassAttributes = "IntrinsicClassAttributes" as __String;
        export const LibraryManagedAttributes = "LibraryManagedAttributes" as __String;
    }
}
