/*@internal*/
namespace ts {
    /* @internal */
    export interface JsxGenericIntrinsicFactory {
        factorySymbol: Symbol;
        map: UnderscoreEscapedMap<JsxIntrinsicElement>;
    }
    /* @internal */
    export interface JsxIntrinsicElement extends JsxIntrinsicAttributesInfo {
        childrenType?: Type;
        returnedType?: Type;
    }

    /*@internal*/
    export function jsxi_generic(typeChecker: JsxTypeChecker, sourceFile: SourceFile): JsxImplementation {
        let intrinsicFactoryEntity: EntityName;
        let intrinsicFactory: JsxGenericIntrinsicFactory;
        let intrinsicFactoryReferenced = false;

        init();

        return {
            sourceFile,
            checkPreconditions: () => undefined as void,
            getNamespace: () => "",
            getValidateChildren: () => true,
            getIntrinsicElementType,
            getCustomElementType,
            getStatelessElementType: () => typeChecker.unknownType,
            getFragmentType: (childrenTypes) => typeChecker.createArrayType(typeChecker.getUnionType(childrenTypes.map(c => c.type), UnionReduction.Literal)),
            getIntrinsicAttributesInfo,
            getIntrinsicChildrenType,
            getJsxIntrinsicTagNames,
            getElementClassType: () => typeChecker.unknownType,
            getElementPropertiesName: () => undefined as __String,
            getElementChildrenPropertyName: () => undefined as __String,
            getIntrinsicAttributesType: () => typeChecker.unknownType,
            getIntrinsicClassAttributesType: () => typeChecker.unknownType,
            emitCreateExpressionForJsxElement,
            emitCreateExpressionForJsxFragment
        };

        function init() {
            const jsxPragmaFactory = sourceFile.pragmas.get("jsx-intrinsic-factory");
            if (jsxPragmaFactory) {
                intrinsicFactoryEntity = parseIsolatedEntityName((isArray(jsxPragmaFactory) ? jsxPragmaFactory[0] : jsxPragmaFactory).arguments.factory, typeChecker.languageVersion);
                if (intrinsicFactoryEntity) {
                    const symbol = typeChecker.resolveEntityName(intrinsicFactoryEntity, SymbolFlags.Function, /*ignoreErrors*/ true, /*dontResolveAlias*/ true, sourceFile);
                    if (symbol) {
                        intrinsicFactory = getIntrinsicFactory(symbol);
                    }
                }

                if (!intrinsicFactory) {
                    typeChecker.error(sourceFile, Diagnostics.Invalid_factory_in_jsx_intrinsic_factory_pragma);
                }
            }
        }

        function getIntrinsicElementType(intrinsicName: __String): Type {
            const elementInfo = getIntrinsicElement(intrinsicName);
            if (elementInfo) {
                if (!intrinsicFactoryReferenced) {
                    intrinsicFactoryReferenced = true;
                    typeChecker.setEntityReferenced(sourceFile, intrinsicFactoryEntity, SymbolFlags.Function);
                }

                if (elementInfo.returnedType) {
                    return elementInfo.returnedType;
                }
            }

            return typeChecker.unknownType;
        }
        function getCustomElementType(tagType: Type): Type {
            if (tagType && (tagType.flags & TypeFlags.Object)) {
                const tagResolvedType = typeChecker.resolveStructuredTypeMembers(<ObjectType>tagType);
                if (tagResolvedType.constructSignatures && tagResolvedType.constructSignatures.length > 0) {
                    return tagResolvedType.constructSignatures[0].resolvedReturnType;
                }
            }

            return typeChecker.unknownType;
        }
        function getIntrinsicAttributesInfo(intrinsicName: __String, errorNode?: Node): JsxIntrinsicAttributesInfo {
            const elementInfo = getIntrinsicElement(intrinsicName);
            if (elementInfo) {
                return elementInfo;
            }

            if (errorNode) {
                if (!intrinsicFactory) {
                    typeChecker.error(errorNode, Diagnostics.No_JSX_intrinsic_factory_defined);
                }
                else {
                    typeChecker.error(errorNode, Diagnostics.Intrinsic_JSX_element_0_does_not_exist_in_factory_1, unescapeLeadingUnderscores(intrinsicName), getFullEntityName(intrinsicFactoryEntity));
                }
            }

            return undefined;
        }
        function getIntrinsicChildrenType(intrinsicName: __String): Type {
            const elementInfo = getIntrinsicElement(intrinsicName);
            if (elementInfo) {
                return elementInfo.childrenType;
            }

            return undefined;
        }
        function getJsxIntrinsicTagNames() {
            const rtn: Symbol[] = [];
            if (intrinsicFactory) {
                intrinsicFactory.map.forEach((e) => { rtn.push(e.intrinsicSymbol); });
            }
            return rtn;
        }
        function getIntrinsicElement(intrinsicName: __String) {
            return intrinsicFactory && (intrinsicFactory.map.get(intrinsicName) || intrinsicFactory.map.get("" as __String));
        }
        function getIntrinsicFactory(createElementFactorySymbol: Symbol): JsxGenericIntrinsicFactory {
            const intrinsicInfo = createUnderscoreEscapedMap<JsxIntrinsicElement>();

            const createElementFactoryType = createElementFactorySymbol && typeChecker.getTypeOfSymbol(createElementFactorySymbol);
            const createElementFactorySignatures = createElementFactoryType && typeChecker.getSignaturesOfType(createElementFactoryType, SignatureKind.Call);
            if (!(createElementFactorySignatures && createElementFactorySignatures.length > 0)) {
                    typeChecker.error(sourceFile, Diagnostics.Invalid_factory_in_jsx_intrinsic_factory_pragma);
                    return undefined;
            }

            createElementFactorySignatures.forEach((callSignature) => {
                if (!(callSignature.parameters && callSignature.parameters.length >= 1 && callSignature.parameters.length <= 3 && callSignature.resolvedReturnType)) {
                        typeChecker.error(callSignature.declaration, Diagnostics.Invalid_factory_in_jsx_intrinsic_factory_pragma);
                        return undefined;
                }

                let attributesType: Type;
                let childrenType: Type;
                const returnedType = callSignature.resolvedReturnType;

                if (callSignature.parameters.length >= 2) {
                    attributesType = typeChecker.getTypeOfSymbol(callSignature.parameters[1]);
                    if (!attributesType) {
                        typeChecker.error(callSignature.declaration, Diagnostics.Invalid_JSX_intrinsic_factory);
                        return;
                    }
                }
                if (callSignature.parameters.length >= 3) {
                    childrenType = typeChecker.getTypeOfSymbol(callSignature.parameters[2]);
                    if (childrenType && typeChecker.isArrayLikeType(childrenType) && (<TypeReference>childrenType).typeArguments) {
                        childrenType = typeChecker.getUnionType((<TypeReference>childrenType).typeArguments, UnionReduction.Literal);
                    }
                    else {
                        typeChecker.error(callSignature.declaration, Diagnostics.Invalid_JSX_intrinsic_factory);
                        return;
                    }
                }

                const todoIntrinsicTypes = [ typeChecker.getTypeOfSymbol(callSignature.parameters[0]) ];
                let todoIndex = 0;
                if (!(todoIntrinsicTypes[0])) {
                    typeChecker.error(callSignature.declaration, Diagnostics.Invalid_JSX_intrinsic_factory);
                    return;
                }

                while (todoIndex < todoIntrinsicTypes.length) {
                    const type = todoIntrinsicTypes[todoIndex++];

                    if (type.flags & TypeFlags.String) {
                        intrinsicInfo.set("" as __String, { attributesType, childrenType, returnedType });
                    }
                    else if (type.flags & TypeFlags.StringLiteral) {
                        // StringLiteralType has no symbol!
                        intrinsicInfo.set(escapeLeadingUnderscores((<StringLiteralType>type).value), { intrinsicSymbol: type.symbol, attributesType, childrenType, returnedType });
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
                        return;
                    }
                }
            });
            return { factorySymbol: createElementFactorySymbol, map: intrinsicInfo };
        }

        function emitCreateExpressionForJsxElement(jsxElement: JsxOpeningLikeElement, props: Expression, children: ReadonlyArray<Expression>, location: TextRange): LeftHandSideExpression {
            const argumentsList = <Expression[]>[];

            if (typeChecker.isJsxIntrinsicIdentifier(jsxElement.tagName)) {
                argumentsList.push(createLiteral(idText(<Identifier>jsxElement.tagName)));
                createArguments();
                return setTextRange(createCall(createJsxFactoryExpression(jsxElement), /*typeArguments*/ undefined, argumentsList), location);
            }

            const symbol = typeChecker.getNodeLinks(jsxElement.tagName).resolvedSymbol;
            const type = symbol && typeChecker.getTypeOfSymbol(symbol);

            if (type && typeChecker.getSignaturesOfType(type, SignatureKind.Construct).length > 0) {
                createArguments();
                return setTextRange(createNew(createExpressionFromEntityName(jsxElement.tagName), /*typeArguments*/ undefined, argumentsList), location);
            }
            else {
                createArguments();
                return setTextRange(createCall(createExpressionFromEntityName(jsxElement.tagName), /*typeArguments*/ undefined, argumentsList), location);
            }

            function createArguments() {
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
            }
        }
        function emitCreateExpressionForJsxFragment(children: ReadonlyArray<Expression>, _parentElement: JsxOpeningFragment, location: TextRange): LeftHandSideExpression {
            return setTextRange(createArrayLiteral((children && children.length > 0) ? children.map((c) => c) : [], /*multiLine*/ true), location);
        }
        function createJsxFactoryExpression(parent: JsxOpeningLikeElement | JsxOpeningFragment): Expression {
            return createJsxFactoryExpressionFromEntityName(intrinsicFactoryEntity ? intrinsicFactoryEntity : createIdentifier("ERROR_UNKNOWN_INTRINSIC_FACTORY"), parent);
        }
    }
}
