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

            return context.getEmitResolver().getJsxImplementation(node).emit.sourceFileTransformer(node, context);
        }
    }
}
