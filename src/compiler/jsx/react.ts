/*@internal*/
namespace ts {
    /* @internal */
    export interface JsxReactIntrinsicData {
        intrinsicSymbol?: Symbol;
        attributesType?: Type;
    }

    /*@internal*/
    export function jsxi_react(typeChecker: JsxTypeChecker, sourceFile: SourceFile | undefined): JsxImplementation {
        let namespace: __String;
        let reactNamespace: string;
        let factoryEntity: EntityName | undefined;
        let jsxNamespaceSymbol: Symbol | undefined;
        const jsxTypes = createUnderscoreEscapedMap<Type>();
        const attributesInfoMap = createUnderscoreEscapedMap<JsxReactIntrinsicData>();

        init();

        return {
            getNamespace: () => unescapeLeadingUnderscores(namespace),
            getJsxIntrinsicTagNames,
            checkPreconditions,
            getValidateChildren: () => false,
            getIntrinsicElementType: getElementType,
            getCustomElementType: getElementType,
            getFragmentType: getElementType,
            getElementBaseType,
            getAttributesType: getEffectiveFirstArgumentForJsxSignature,
            getIntrinsicChildrenType: () => undefined,
            getIntrinsicSignature,
            getIntrinsicSymbol,
            getElementChildrenPropertyName,
            getIntrinsicAttributesType,
            getIntrinsicClassAttributesType,
            emitCreateExpressionForJsxElement,
            emitCreateExpressionForJsxFragment,

            getJsxNamespaceSymbol
        };

        function init() {
            if (sourceFile) {
                const jsxPragmaJsx = sourceFile.pragmas.get("jsx");
                if (jsxPragmaJsx) {
                    const chosenpragma: any = isArray(jsxPragmaJsx) ? jsxPragmaJsx[0] : jsxPragmaJsx; // TODO: GH#18217
                    factoryEntity = parseIsolatedEntityName(chosenpragma.arguments.factory, typeChecker.languageVersion);
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

        function getJsxNamespaceSymbol() {
            if (!jsxNamespaceSymbol) {
                if (sourceFile) {
                    const resolvedNamespace = typeChecker.resolveName(sourceFile, namespace, SymbolFlags.Namespace, /*diagnosticMessage*/ undefined, namespace, /*isUse*/ false, /*excludeGlobals*/ false);
                    if (resolvedNamespace) {
                        jsxNamespaceSymbol = typeChecker.resolveSymbol(typeChecker.getSymbol(typeChecker.getExportsOfSymbol(typeChecker.resolveSymbol(resolvedNamespace)), JsxNames.JSX, SymbolFlags.Namespace));
                    }
                }

                if (!jsxNamespaceSymbol) {
                    jsxNamespaceSymbol = typeChecker.getGlobalSymbol(JsxNames.JSX, SymbolFlags.Namespace, /*diagnosticMessage*/ undefined);
                }
            }

            return jsxNamespaceSymbol;
        }
        function getJsxIntrinsicTagNames() {
                const t = getJsxType(JsxNames.IntrinsicElements);
                return t !== typeChecker.errorType ? typeChecker.getPropertiesOfType(t) : emptyArray;
        }

        function checkPreconditions(node: JsxOpeningLikeElement | JsxOpeningFragment, diagnostics: boolean): void {
            // Preconditions for using JSX
            if ((typeChecker.compilerOptions.jsx || JsxEmit.None) === JsxEmit.None) {
                typeChecker.error(node, Diagnostics.Cannot_use_JSX_unless_the_jsx_flag_is_provided);
                return;
            }

            // The reactNamespace/jsxFactory's root symbol should be marked as 'used' so we don't incorrectly elide its import.
            // And if there is no reactNamespace/jsxFactory's symbol in scope when targeting React emit, we should issue an error.
            const reactSym = typeChecker.resolveName(isJsxOpeningLikeElement(node) ? node.tagName : node, namespace, SymbolFlags.Value, diagnostics && typeChecker.compilerOptions.jsx === JsxEmit.React ? Diagnostics.Cannot_find_name_0 : undefined, namespace, /*isUse*/ true, /*excludeGlobals*/ false);
            if (reactSym) {
                // Mark local symbol as referenced here because it might not have been marked
                // if jsx emit was not react as there wont be error being emitted
                reactSym.isReferenced = SymbolFlags.All;

                // If react symbol is alias, mark it as refereced
                if (reactSym.flags & SymbolFlags.Alias) {
                    typeChecker.markAliasSymbolAsReferenced(reactSym);
                }
            }
        }
        function getIntrinsicSignature(intrinsicName: __String, node: JsxOpeningLikeElement) {
            const intrinsicInfo = getIntrinsicAttributesInfo(intrinsicName, node, /* reportAny */ false);
            if (!(intrinsicInfo && intrinsicInfo.attributesType)) {
                return undefined;
            }

            return { signature: createSignatureForJSXIntrinsic(node, intrinsicInfo.attributesType), attrType: intrinsicInfo.attributesType };
        }
        function getElementBaseType(refKind: JsxReferenceKind): Type | undefined {
            switch (refKind) {
            case JsxReferenceKind.Function: {
                    const elementType = getElementType();
                    if (elementType !== typeChecker.errorType) {
                        return typeChecker.getUnionType([elementType, typeChecker.nullType], UnionReduction.Literal);
                    }
                }
                break;
            case JsxReferenceKind.Component: {
                    const classConstraint = getElementClassType();
                    if (classConstraint !== typeChecker.errorType) {
                        return classConstraint;
                    }
                }
                break;
            case JsxReferenceKind.Mixed: {
                    const sfcReturnConstraint = getElementBaseType(JsxReferenceKind.Function);
                    const classConstraint = getElementBaseType(JsxReferenceKind.Component);
                    if (sfcReturnConstraint && classConstraint) {
                        return typeChecker.getUnionType([sfcReturnConstraint, classConstraint], UnionReduction.Literal);
                    }
                }
                break;
            }

            return typeChecker.anyType;
        }
        function getIntrinsicSymbol(intrinsicName: __String, errorNode: Node, reportAny: boolean): Symbol {
            const x = getIntrinsicAttributesInfo(intrinsicName, errorNode, reportAny);
            if (x && x.intrinsicSymbol) {
                return x.intrinsicSymbol;
            }

            return typeChecker.unknownSymbol;
        }

        function getEffectiveFirstArgumentForJsxSignature(refKind: JsxReferenceKind, node: JsxOpeningLikeElement, signature: Signature): Type {
            return refKind !== JsxReferenceKind.Component ? getJsxPropsTypeFromCallSignature(signature, node) : getJsxPropsTypeFromClassType(signature, node);
        }
        function getJsxPropsTypeFromCallSignature(sig: Signature, context: JsxOpeningLikeElement) {
            let propsType = typeChecker.getTypeOfFirstParameterOfSignatureWithFallback(sig, typeChecker.unknownType);
            propsType = getJsxManagedAttributesFromLocatedAttributes(context, propsType);
            const intrinsicAttribs = getIntrinsicAttributesType();
            if (intrinsicAttribs !== typeChecker.errorType) {
                propsType = typeChecker.intersectTypes(intrinsicAttribs, propsType);
            }
            return propsType;
        }
        function getJsxPropsTypeForSignatureFromMember(sig: Signature, forcedLookupLocation: __String) {
            if (sig.unionSignatures) {
                // JSX Elements using the legacy `props`-field based lookup (eg, react class components) need to treat the `props` member as an input
                // instead of an output position when resolving the signature. We need to go back to the input signatures of the composite signature,
                // get the type of `props` on each return type individually, and then _intersect them_, rather than union them (as would normally occur
                // for a union signature). It's an unfortunate quirk of looking in the output of the signature for the type we want to use for the input.
                // The default behavior of `getTypeOfFirstParameterOfSignatureWithFallback` when no `props` member name is defined is much more sane.
                const results: Type[] = [];
                for (const signature of sig.unionSignatures) {
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
                return typeChecker.getIntersectionType(results);
            }

            const instanceType = typeChecker.getReturnTypeOfSignature(sig);
            return typeChecker.isTypeAny(instanceType) ? instanceType : typeChecker.getTypeOfPropertyOfType(instanceType, forcedLookupLocation);
        }
        function getStaticTypeOfReferencedJsxConstructor(context: JsxOpeningLikeElement) {
            if (typeChecker.getJsxReferenceKind(context) === JsxReferenceKind.Intrinsic) {
                const intrinsicInfo = getIntrinsicAttributesInfo((context.tagName as Identifier).escapedText);
                const result = (intrinsicInfo && intrinsicInfo.attributesType) ? intrinsicInfo.attributesType : typeChecker.errorType;
                return typeChecker.getOrCreateTypeFromSignature(createSignatureForJSXIntrinsic(context, result));
            }
            const tagType = typeChecker.checkExpressionCached(context.tagName);
            if (tagType.flags & TypeFlags.StringLiteral) {
                const intrinsicInfo = getIntrinsicAttributesInfo(escapeLeadingUnderscores((tagType as StringLiteralType).value));
                if (!(intrinsicInfo && intrinsicInfo.attributesType)) {
                    return typeChecker.errorType;
                }
                return typeChecker.getOrCreateTypeFromSignature(createSignatureForJSXIntrinsic(context, intrinsicInfo.attributesType));
            }
            return tagType;
        }
        function getJsxManagedAttributesFromLocatedAttributes(context: JsxOpeningLikeElement, attributesType: Type) {
            getJsxNamespaceSymbol();
            const managedSym = jsxNamespaceSymbol && typeChecker.getSymbol(jsxNamespaceSymbol.exports!, JsxNames.LibraryManagedAttributes, SymbolFlags.Type);
            if (managedSym) {
                const declaredManagedType = typeChecker.getDeclaredTypeOfSymbol(managedSym);
                const ctorType = getStaticTypeOfReferencedJsxConstructor(context);
                if (length((declaredManagedType as GenericType).typeParameters) >= 2) {
                    const args = typeChecker.fillMissingTypeArguments([ctorType, attributesType], (declaredManagedType as GenericType).typeParameters, 2, isInJSFile(context));
                    return typeChecker.createTypeReference((declaredManagedType as GenericType), args);
                }
                else if (length(declaredManagedType.aliasTypeArguments) >= 2) {
                    const args = typeChecker.fillMissingTypeArguments([ctorType, attributesType], declaredManagedType.aliasTypeArguments!, 2, isInJSFile(context));
                    return typeChecker.getTypeAliasInstantiation(declaredManagedType.aliasSymbol!, args);
                }
            }
            return attributesType;
        }
        function getJsxPropsTypeFromClassType(sig: Signature, context: JsxOpeningLikeElement) {
            const forcedLookupLocation = getElementPropertiesName();
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

            attributesType = getJsxManagedAttributesFromLocatedAttributes(context, attributesType);

            if (typeChecker.isTypeAny(attributesType)) {
                // Props is of type 'any' or unknown
                return attributesType;
            }
            else {
                // Normal case -- add in IntrinsicClassElements<T> and IntrinsicElements
                let apparentAttributesType = attributesType;
                const intrinsicClassAttribs = getIntrinsicClassAttributesType();
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

                const intrinsicAttribs = getIntrinsicAttributesType();
                if (intrinsicAttribs !== typeChecker.errorType) {
                    apparentAttributesType = typeChecker.intersectTypes(intrinsicAttribs, apparentAttributesType);
                }

                return apparentAttributesType;
            }
        }
        function getNameFromJsxElementAttributesContainer(nameOfAttribPropContainer: __String): __String | undefined {
            getJsxNamespaceSymbol();
            // JSX.ElementAttributesProperty | JSX.ElementChildrenAttribute [symbol]
            const jsxElementAttribPropInterfaceSym = jsxNamespaceSymbol && jsxNamespaceSymbol.exports && typeChecker.getSymbol(jsxNamespaceSymbol.exports, nameOfAttribPropContainer, SymbolFlags.Type);
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
                    typeChecker.error(jsxElementAttribPropInterfaceSym!.declarations[0], Diagnostics.The_global_type_JSX_0_may_not_have_more_than_one_property, unescapeLeadingUnderscores(nameOfAttribPropContainer));
                }
            }
            return undefined;
        }
        function createSignatureForJSXIntrinsic(node: JsxOpeningLikeElement, attributesType: Type): Signature {
            getJsxNamespaceSymbol();
            const exports = jsxNamespaceSymbol && typeChecker.getExportsOfSymbol(jsxNamespaceSymbol);
            // We fake up a SFC signature for each intrinsic, however a more specific per-element signature drawn from the JSX declaration
            // file would probably be preferable.
            const typeSymbol = exports && typeChecker.getSymbol(exports, JsxNames.Element, SymbolFlags.Type);
            const returnNode = typeSymbol && typeChecker.nodeBuildersymbolToEntityName(typeSymbol, SymbolFlags.Type, node);
            const declaration = createFunctionTypeNode(/*typeParameters*/ undefined,
                    [ createParameter(/*decorators*/ undefined, /*modifiers*/ undefined, /*dotdotdot*/ undefined, "props", /*questionMark*/ undefined, typeChecker.nodeBuildertypeToTypeNode(attributesType, node)) ],
                    returnNode ? createTypeReferenceNode(returnNode, /*typeArguments*/ undefined) : createKeywordTypeNode(SyntaxKind.AnyKeyword)
                );
            const parameterSymbol = typeChecker.createSymbol(SymbolFlags.FunctionScopedVariable, "props" as __String);
            parameterSymbol.type = attributesType;
            return typeChecker.createSignature(
                    declaration,
                    /*typeParameters*/ undefined,
                    /*thisParameter*/ undefined,
                    [ parameterSymbol ],
                     typeSymbol ? typeChecker.getDeclaredTypeOfSymbol(typeSymbol) : typeChecker.errorType,
                    /*returnTypePredicate*/ undefined,
                    1,
                    /*hasRestparameter*/ false,
                    /*hasLiteralTypes*/ false
                );
        }

        function getElementType() {
            return getJsxType(JsxNames.Element);
        }
        function getElementClassType() {
            return getJsxType(JsxNames.ElementClass);
        }
        function getElementChildrenPropertyName() {
            return getNameFromJsxElementAttributesContainer(JsxNames.ElementChildrenAttributeNameContainer);
        }
        function getIntrinsicAttributesType() {
            return getJsxType(JsxNames.IntrinsicAttributes);
        }
        function getIntrinsicClassAttributesType() {
            return getJsxType(JsxNames.IntrinsicClassAttributes);
        }
        function getElementPropertiesName() {
            return getNameFromJsxElementAttributesContainer(JsxNames.ElementAttributesPropertyNameContainer);
        }
        function getJsxType(name: __String) {
            if (jsxTypes.has(name)) {
                return jsxTypes.get(name)!;
            }

            getJsxNamespaceSymbol();
            const exports = jsxNamespaceSymbol && typeChecker.getExportsOfSymbol(jsxNamespaceSymbol);
            const typeSymbol = exports && typeChecker.getSymbol(exports, name, SymbolFlags.Type);
            const type = typeSymbol ? typeChecker.getDeclaredTypeOfSymbol(typeSymbol) : typeChecker.errorType;

            jsxTypes.set(name, type);

            return type;
        }

        function emitCreateExpressionForJsxElement(jsxElement: JsxOpeningLikeElement, props: Expression, children: ReadonlyArray<Expression>, location: TextRange): LeftHandSideExpression {
            const argumentsList = [
                    typeChecker.getJsxReferenceKind(jsxElement) === JsxReferenceKind.Intrinsic
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

        function getIntrinsicAttributesInfo(intrinsicName: __String, errorNode?: Node, reportAny?: boolean): JsxReactIntrinsicData | undefined {
            let rtn = attributesInfoMap.get(intrinsicName);

            if (rtn === undefined || (reportAny && !rtn.intrinsicSymbol)) {
                rtn = _getIntrinsicAttributesInfo(intrinsicName, errorNode, reportAny);
                if (rtn !== undefined) {
                    attributesInfoMap.set(intrinsicName, rtn);
                }
            }

            return rtn;
        }
        function _getIntrinsicAttributesInfo(intrinsicName: __String, errorNode?: Node, reportAny?: boolean): JsxReactIntrinsicData | undefined {
            const intrinsicElementsType = getJsxType(JsxNames.IntrinsicElements);
            if (intrinsicName && intrinsicElementsType !== typeChecker.errorType) {
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

                return undefined;
            }
            else {
                if (errorNode && reportAny) {
                    typeChecker.error(errorNode, Diagnostics.JSX_element_implicitly_has_type_any_because_no_interface_JSX_0_exists, unescapeLeadingUnderscores(JsxNames.IntrinsicElements));
                }

                return { attributesType: typeChecker.anyType };
            }
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
        export const LibraryManagedAttributes = "LibraryManagedAttributes" as __String;
        // tslint:enable variable-name
    }
}
