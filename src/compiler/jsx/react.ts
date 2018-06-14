/*@internal*/
namespace ts {
    /*@internal*/
    export function jsxi_react(typeChecker: JsxTypeChecker, sourceFile: SourceFile | undefined): JsxImplementation {
        let namespace: __String;
        let reactNamespace: string;
        let factoryEntity: EntityName;
        let jsxNamespaceSymbol: Symbol;
        const jsxTypes = createUnderscoreEscapedMap<Type>();

        init();

        return {
            sourceFile,
            checkPreconditions,
            getNamespace: () => unescapeLeadingUnderscores(namespace),
            getValidateChildren: () => false,
            getIntrinsicElementType: () => getJsxType(JsxNames.Element),
            getCustomElementType: () => getJsxType(JsxNames.Element),
            getStatelessElementType: () => typeChecker.getUnionType([getJsxType(JsxNames.Element), typeChecker.nullType], UnionReduction.Literal),
            getFragmentType: () => getJsxType(JsxNames.Element),
            getIntrinsicAttributesInfo,
            getIntrinsicChildrenType: () => undefined,
            getJsxIntrinsicTagNames,
            getElementClassType: () => getJsxType(JsxNames.ElementClass),
            getElementPropertiesName: () => getNameFromElementAttributesContainer(JsxNames.ElementAttributesPropertyNameContainer),
            getElementChildrenPropertyName: () => getNameFromElementAttributesContainer(JsxNames.ElementChildrenAttributeNameContainer),
            getIntrinsicAttributesType: () => getJsxType(JsxNames.IntrinsicAttributes),
            getIntrinsicClassAttributesType: () => getJsxType(JsxNames.IntrinsicClassAttributes),
            emitCreateExpressionForJsxElement,
            emitCreateExpressionForJsxFragment
        };

        function init() {
            if (sourceFile) {
                const jsxPragmaJsx = sourceFile.pragmas.get("jsx");
                if (jsxPragmaJsx) {
                    factoryEntity = parseIsolatedEntityName((isArray(jsxPragmaJsx) ? jsxPragmaJsx[0] : jsxPragmaJsx).arguments.factory, typeChecker.languageVersion);
                    if (factoryEntity) {
                        namespace = typeChecker.getFirstIdentifier(factoryEntity).escapedText;
                    }
                    else {
                        typeChecker.error(sourceFile, Diagnostics.Invalid_factory_in_jsx_pragma);
                        namespace = "UNKNOWN_NAMESPACE" as __String;
                    }
                }
            }

            if (!namespace) {
                namespace = "React" as __String;
                if (typeChecker.compilerOptions.jsxFactory) {
                    factoryEntity = parseIsolatedEntityName(typeChecker.compilerOptions.jsxFactory, typeChecker.languageVersion);
                    if (factoryEntity) {
                        namespace = typeChecker.getFirstIdentifier(factoryEntity).escapedText;
                    }
                }
                else if (typeChecker.compilerOptions.reactNamespace) {
                    namespace = escapeLeadingUnderscores(typeChecker.compilerOptions.reactNamespace);
                }
            }

            reactNamespace = typeChecker.compilerOptions.reactNamespace || "React";
        }

        function checkPreconditions(node: JsxOpeningLikeElement | JsxOpeningFragment): void {
            // Preconditions for using JSX
            if ((typeChecker.compilerOptions.jsx || JsxEmit.None) === JsxEmit.None) {
                typeChecker.error(node, Diagnostics.Cannot_use_JSX_unless_the_jsx_flag_is_provided);
                return;
            }

            // The reactNamespace/jsxFactory's root symbol should be marked as 'used' so we don't incorrectly elide its import.
            // And if there is no reactNamespace/jsxFactory's symbol in scope when targeting React emit, we should issue an error.
            const reactSym = typeChecker.resolveName(isJsxOpeningLikeElement(node) ? node.tagName : node, namespace, SymbolFlags.Value, typeChecker.hasDiagnostics() && typeChecker.compilerOptions.jsx === JsxEmit.React ? Diagnostics.Cannot_find_name_0 : undefined, namespace, /*isUse*/ true, /*excludeGlobals*/ false);
            if (reactSym) {
                // Mark local symbol as referenced here because it might not have been marked
                // if jsx emit was not react as there wont be error being emitted
                reactSym.isReferenced = SymbolFlags.All;

                // If react symbol is alias, mark it as refereced
                if (reactSym.flags & SymbolFlags.Alias && !typeChecker.isConstEnumOrConstEnumOnlyModule(typeChecker.resolveAlias(reactSym))) {
                    typeChecker.markAliasSymbolAsReferenced(reactSym);
                }
            }
        }
        function getIntrinsicAttributesInfo(intrinsicName: __String, errorNode?: Node): JsxIntrinsicAttributesInfo {
            const intrinsicElementsType = getJsxType(JsxNames.IntrinsicElements);
            if (intrinsicName && intrinsicElementsType !== typeChecker.unknownType) {
                const intrinsicProp = typeChecker.getPropertyOfType(intrinsicElementsType, intrinsicName);
                if (intrinsicProp) {
                    return {
                        intrinsicSymbol: intrinsicProp,
                        attributesType: typeChecker.getTypeOfSymbol(intrinsicProp)
                    };
                }
                const indexSignatureType = typeChecker.getIndexTypeOfType(intrinsicElementsType, IndexKind.String);
                if (indexSignatureType) {
                    return {
                        intrinsicSymbol: intrinsicElementsType.symbol, // I think this a bug! Using the symbol of IntrinsicElements { [string]: Attributes } is incorrect.
                                                                        // But for now keep it for backward compaplitity.
                        attributesType: indexSignatureType
                    };
                }

                if (errorNode) {
                    typeChecker.error(errorNode, Diagnostics.Property_0_does_not_exist_on_type_1, unescapeLeadingUnderscores(intrinsicName), JsxNames.JSX + "." + JsxNames.IntrinsicElements);
                }
            }
            else {
                if (errorNode && typeChecker.noImplicitAny) {
                    typeChecker.error(errorNode, Diagnostics.JSX_element_implicitly_has_type_any_because_no_interface_JSX_0_exists, unescapeLeadingUnderscores(JsxNames.IntrinsicElements));
                }
            }

            return undefined;
        }
        function getJsxIntrinsicTagNames() {
                const t = getJsxType(JsxNames.IntrinsicElements);
                return t !== typeChecker.unknownType ? typeChecker.getPropertiesOfType(t) : emptyArray;
        }
        function getJsxNamespaceSymbol() {
            if (!jsxNamespaceSymbol) {
                if (sourceFile) {
                    const resolvedNamespace = typeChecker.resolveName(sourceFile, namespace, SymbolFlags.Namespace, /*diagnosticMessage*/ undefined, namespace, /*isUse*/ false, /*excludeGlobals*/ false);
                    if (resolvedNamespace) {
                        jsxNamespaceSymbol = typeChecker.getSymbol(typeChecker.getExportsOfSymbol(typeChecker.resolveSymbol(resolvedNamespace)), JsxNames.JSX, SymbolFlags.Namespace);
                    }
                }

                if (!jsxNamespaceSymbol) {
                    jsxNamespaceSymbol = typeChecker.getGlobalSymbol(JsxNames.JSX, SymbolFlags.Namespace, /*diagnosticMessage*/ undefined);
                }
            }

            return jsxNamespaceSymbol;
        }
        function getJsxType(name: __String) {
            if (jsxTypes.has(name)) {
                return jsxTypes.get(name);
            }

            const exports = getJsxNamespaceSymbol() && typeChecker.getExportsOfSymbol(jsxNamespaceSymbol);
            const typeSymbol = exports && typeChecker.getSymbol(exports, name, SymbolFlags.Type);
            const type = typeSymbol ? typeChecker.getDeclaredTypeOfSymbol(typeSymbol) : typeChecker.unknownType;

            jsxTypes.set(name, type);

            return type;
        }
        /**
         * Look into JSX namespace and then look for container with matching name as nameOfAttribPropContainer.
         * Get a single property from that container if existed. Report an error if there are more than one property.
         *
         * @param nameOfAttribPropContainer a string of value JsxNames.ElementAttributesPropertyNameContainer or JsxNames.ElementChildrenAttributeNameContainer
         *          if other string is given or the container doesn't exist, return undefined.
         */
        function getNameFromElementAttributesContainer(nameOfAttribPropContainer: __String): __String {
            // JSX.ElementAttributesProperty | JSX.ElementChildrenAttribute [symbol]
            const jsxElementAttribPropInterfaceSym = getJsxNamespaceSymbol() && typeChecker.getSymbol(jsxNamespaceSymbol.exports, nameOfAttribPropContainer, SymbolFlags.Type);
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
                else if (propertiesOfJsxElementAttribPropInterface.length > 1) {
                    // More than one property on ElementAttributesProperty is an error
                    typeChecker.error(jsxElementAttribPropInterfaceSym.declarations[0], Diagnostics.The_global_type_JSX_0_may_not_have_more_than_one_property, unescapeLeadingUnderscores(nameOfAttribPropContainer));
                }
            }
            return undefined;
        }

        function emitCreateExpressionForJsxElement(jsxElement: JsxOpeningLikeElement, props: Expression, children: ReadonlyArray<Expression>, location: TextRange): LeftHandSideExpression {
            const argumentsList = [
                    typeChecker.isJsxIntrinsicIdentifier(jsxElement.tagName)
                                    ? createLiteral(idText(<Identifier>jsxElement.tagName))
                                    : createExpressionFromEntityName(jsxElement.tagName)
                ];

            if (props) {
                argumentsList.push(props);
            }

            if (children && children.length > 0) {
                if (!props) {
                    argumentsList.push(createNull());
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

            return setTextRange(createCall(createJsxFactoryExpression(jsxElement), /*typeArguments*/ undefined, argumentsList), location);
        }
        function emitCreateExpressionForJsxFragment(children: ReadonlyArray<Expression>, parentElement: JsxOpeningFragment, location: TextRange): LeftHandSideExpression {
            const tagName = createPropertyAccess(createReactNamespace(reactNamespace, parentElement), "Fragment");

            const argumentsList = [<Expression>tagName];
            argumentsList.push(createNull());

            if (children && children.length > 0) {
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

            return setTextRange(
                createCall(
                    createJsxFactoryExpression(parentElement),
                    /*typeArguments*/ undefined,
                    argumentsList
                ),
                location
            );
        }
        function createJsxFactoryExpression(parent: JsxOpeningLikeElement | JsxOpeningFragment): Expression {
            return factoryEntity
                    ? createJsxFactoryExpressionFromEntityName(factoryEntity, parent)
                    : createPropertyAccess(createReactNamespace(reactNamespace, parent), "createElement");
        }
    }

    namespace JsxNames {
        // tslint:disable variable-name
        export const JSX = "JSX" as __String;
        export const IntrinsicElements = "IntrinsicElements" as __String;
        export const ElementClass = "ElementClass" as __String;
        export const ElementAttributesPropertyNameContainer = "ElementAttributesProperty" as __String; // TODO: Deprecate and remove support
        export const ElementChildrenAttributeNameContainer = "ElementChildrenAttribute" as __String;
        export const Element = "Element" as __String;
        export const IntrinsicAttributes = "IntrinsicAttributes" as __String;
        export const IntrinsicClassAttributes = "IntrinsicClassAttributes" as __String;
        // tslint:enable variable-name
    }
}
