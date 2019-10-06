/*@internal*/
namespace ts {
    /* @internal */
    export interface JsxGenericIntrinsicFactory {
        factorySymbol: Symbol;
        map: UnderscoreEscapedMap<JsxGenericIntrinsicData>;
    }
    /* @internal */
    export interface JsxGenericIntrinsicData {
        callSignature: Signature;
        returnedType: Type;
        intrinsicSymbol: Symbol;
        attributesType: Type;
        childrenType?: Type;
    }

    /*@internal*/
    export function jsxi_generic(typeChecker: JsxTypeChecker, sourceFile: SourceFile): JsxImplementation {
        let intrinsicFactoryEntity: EntityName | undefined;
        let intrinsicFactory: JsxGenericIntrinsicFactory | undefined;
        let intrinsicFactoryReferenced = false;

        init();

        return {
            getNamespace: () => "",
            getJsxIntrinsicTagNames,
            checkPreconditions: () => undefined,
            getValidateChildren: () => true,
            getIntrinsicElementType,
            getCustomElementType,
            getFragmentType,
            getElementBaseType,
            getAttributesType,
            getIntrinsicChildrenType,
            getIntrinsicSignature,
            getIntrinsicSymbol,
            getElementChildrenPropertyName: () => undefined as __String,
            getIntrinsicAttributesType: () => typeChecker.errorType,
            getIntrinsicClassAttributesType: () => typeChecker.errorType,
            emitCreateExpressionForJsxElement,
            emitCreateExpressionForJsxFragment,

            getJsxNamespaceSymbol: () => undefined
        };

        function init() {
            const jsxPragmaFactory = sourceFile.pragmas.get("jsx-intrinsic-factory");
            if (jsxPragmaFactory) {
                const chosenpragma: any = isArray(jsxPragmaFactory) ? jsxPragmaFactory[0] : jsxPragmaFactory; // TODO: GH#18217
                intrinsicFactoryEntity = parseIsolatedEntityName(chosenpragma.arguments.factory, typeChecker.languageVersion);
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

        function getJsxIntrinsicTagNames() {
            const rtn: Symbol[] = [];
            if (intrinsicFactory) {
                intrinsicFactory.map.forEach((e) => {
                                                 if (e.intrinsicSymbol !== typeChecker.unknownSymbol) {
                                                     rtn.push(e.intrinsicSymbol);
                                                 }
                                             });
            }
            return rtn;
        }
        function getIntrinsicElementType(intrinsicName: __String): Type {
            const elementInfo = getIntrinsicElement(intrinsicName);
            if (elementInfo) {
                if (!intrinsicFactoryReferenced && intrinsicFactoryEntity) {
                    intrinsicFactoryReferenced = true;
                    typeChecker.setEntityReferenced(sourceFile, intrinsicFactoryEntity, SymbolFlags.Function);
                }

                if (elementInfo.returnedType) {
                    return elementInfo.returnedType;
                }
            }

            return typeChecker.errorType;
        }
        function getCustomElementType(tagType: Type): Type {
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
        function getFragmentType(childrenTypes: ReadonlyArray<Type>): Type {
            return typeChecker.createArrayType(typeChecker.getUnionType(childrenTypes, UnionReduction.Literal));
        }
        function getElementBaseType(refKind: JsxReferenceKind) {
            return refKind === JsxReferenceKind.Intrinsic || refKind === JsxReferenceKind.Component || refKind === JsxReferenceKind.Function ? typeChecker.anyType : undefined;
        }
        function getAttributesType(refKind: JsxReferenceKind, node: JsxOpeningLikeElement, signature: Signature): Type {
            switch (refKind) {
            case JsxReferenceKind.Intrinsic: {
                    if (!isIdentifier(node.tagName)) return Debug.fail();
                    const i = getIntrinsicElement(node.tagName.escapedText);
                    return (i && i.attributesType) ? i.attributesType : typeChecker.errorType;
                }
            case JsxReferenceKind.Component:
            case JsxReferenceKind.Function:
                return typeChecker.getTypeOfFirstParameterOfSignatureWithFallback(signature, typeChecker.emptyObjectType);

            default:
                return typeChecker.emptyObjectType;
            }
        }
        function getIntrinsicChildrenType(intrinsicName: __String): Type | undefined {
            const elementInfo = getIntrinsicElement(intrinsicName);
            if (elementInfo) {
                return elementInfo.childrenType;
            }

            return undefined;
        }
        function getIntrinsicSignature(_intrinsicName: __String, node: JsxOpeningLikeElement) {
            if (!isIdentifier(node.tagName)) return Debug.fail();

            const intrinsicInfo = getIntrinsicElement(node.tagName.escapedText);
            return (intrinsicInfo && intrinsicInfo.callSignature && intrinsicInfo.attributesType)
                    ? { signature: intrinsicInfo.callSignature, attrType: intrinsicInfo.attributesType }
                    : undefined;
        }
        function getIntrinsicSymbol(intrinsicName: __String, errorNode: Node): Symbol {
            const elementInfo = getIntrinsicElement(intrinsicName);
            if (elementInfo) {
                return elementInfo.intrinsicSymbol;
            }

            if (errorNode) {
                if (!intrinsicFactory) {
                    typeChecker.error(errorNode, Diagnostics.No_JSX_intrinsic_factory_defined);
                }
                else {
                    typeChecker.error(errorNode, Diagnostics.Intrinsic_JSX_element_0_does_not_exist_in_factory_1, unescapeLeadingUnderscores(intrinsicName), getFullEntityName(intrinsicFactoryEntity!));
                }
            }

            return typeChecker.unknownSymbol;
        }
        function emitCreateExpressionForJsxElement(jsxElement: JsxOpeningLikeElement, props: Expression, children: ReadonlyArray<Expression>, location: TextRange): LeftHandSideExpression {
            const argumentsList = <Expression[]>[];
            switch (typeChecker.getJsxReferenceKind(jsxElement)) {
            case JsxReferenceKind.Intrinsic:
                argumentsList.push(createLiteral(idText(<Identifier>jsxElement.tagName)));
                createArguments();
                return setTextRange(createCall(createJsxFactoryExpression(jsxElement), /*typeArguments*/ undefined, argumentsList), location);

            case JsxReferenceKind.Component:
                createArguments();
                return setTextRange(createNew(createExpressionFromEntityName(jsxElement.tagName), /*typeArguments*/ undefined, argumentsList), location);

            case JsxReferenceKind.Function:
                createArguments();
                return setTextRange(createCall(createExpressionFromEntityName(jsxElement.tagName), /*typeArguments*/ undefined, argumentsList), location);

            default:
                return Debug.fail("Invalid jsxReferenceKind");
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

        function getIntrinsicFactory(createElementFactorySymbol: Symbol): JsxGenericIntrinsicFactory | undefined {
            const intrinsicInfo = createUnderscoreEscapedMap<JsxGenericIntrinsicData>();

            const createElementFactoryType = createElementFactorySymbol && typeChecker.getTypeOfSymbol(createElementFactorySymbol);
            const createElementFactorySignatures = createElementFactoryType && typeChecker.getSignaturesOfType(createElementFactoryType, SignatureKind.Call);
            if (!(createElementFactorySignatures && createElementFactorySignatures.length > 0)) {
                    typeChecker.error(sourceFile, Diagnostics.Invalid_factory_in_jsx_intrinsic_factory_pragma);
                    return undefined;
            }

            createElementFactorySignatures.forEach((callSignature) => {
                if (!(callSignature.parameters && callSignature.parameters.length >= 1 && callSignature.parameters.length <= 3)) {
                        typeChecker.error(callSignature.declaration, Diagnostics.Invalid_factory_in_jsx_intrinsic_factory_pragma);
                        return undefined;
                }

                const returnedType = typeChecker.getReturnTypeOfSignature(callSignature);
                let attributesType: Type = typeChecker.emptyObjectType;
                let childrenType: Type | undefined;

                if (callSignature.parameters.length >= 2) {
                    attributesType = typeChecker.getTypeOfSymbol(callSignature.parameters[1]);
                }
                if (callSignature.parameters.length >= 3) {
                    childrenType = typeChecker.getTypeOfSymbol(callSignature.parameters[2]);
                    if (childrenType && typeChecker.isArrayLikeType(childrenType) && (<TypeReference>childrenType).typeArguments) {
                        childrenType = typeChecker.getUnionType((<TypeReference>childrenType).typeArguments!, UnionReduction.Literal);
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
                        intrinsicInfo.set("" as __String, { callSignature, returnedType, intrinsicSymbol: typeChecker.unknownSymbol, attributesType, childrenType });
                    }
                    else if (type.flags & TypeFlags.StringLiteral) {
                        // StringLiteralType has no symbol!
                        intrinsicInfo.set(escapeLeadingUnderscores((<StringLiteralType>type).value), { callSignature, returnedType, intrinsicSymbol: type.symbol, attributesType, childrenType });
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
        function getIntrinsicElement(intrinsicName: __String) {
            return intrinsicFactory && (intrinsicFactory.map.get(intrinsicName) || intrinsicFactory.map.get("" as __String));
        }
        function createJsxFactoryExpression(parent: JsxOpeningLikeElement | JsxOpeningFragment): Expression {
            return createJsxFactoryExpressionFromEntityName(intrinsicFactoryEntity ? intrinsicFactoryEntity : createIdentifier("ERROR_UNKNOWN_INTRINSIC_FACTORY"), parent);
        }
    }
}
