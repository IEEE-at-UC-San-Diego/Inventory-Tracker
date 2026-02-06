import type { Group as KonvaGroup } from "konva/lib/Group";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Transformer as KonvaTransformer } from "konva/lib/shapes/Transformer";
import { memo, useCallback, useRef } from "react";
import { Group, Image as KonvaImage, Rect, Transformer } from "react-konva";
import useImage from "use-image";
import type { Drawer, DrawerBackgroundImage } from "@/types";

interface DrawerBackgroundImageShapeProps {
	image: DrawerBackgroundImage;
	drawer: Drawer;
	imageUrl?: string | null;
	isSelected: boolean;
	isEditable: boolean;
	onSelect: (imageId: string) => void;
	onUpdate: (
		imageId: string,
		updates: Partial<
			Pick<DrawerBackgroundImage, "x" | "y" | "width" | "height">
		>,
	) => void;
}

const GRID_SIZE = 50;
const snapToGrid = (value: number): number =>
	Math.round(value / GRID_SIZE) * GRID_SIZE;

export const DrawerBackgroundImageShape = memo(
	function DrawerBackgroundImageShape({
		image,
		drawer,
		imageUrl,
		isSelected,
		isEditable,
		onSelect,
		onUpdate,
	}: DrawerBackgroundImageShapeProps) {
		const [img] = useImage(imageUrl ?? "");
		const groupRef = useRef<KonvaGroup>(null);
		const transformerRef = useRef<KonvaTransformer>(null);

		const effectiveEditable = isEditable && !image.locked;
		const absX = drawer.x + image.x;
		const absY = drawer.y + image.y;

		const handleDragEnd = useCallback(
			(e: KonvaEventObject<DragEvent>) => {
				if (!effectiveEditable) return;
				const x = e.target.x() - drawer.x;
				const y = e.target.y() - drawer.y;
				onUpdate(image._id, {
					x: image.snapToGrid ? snapToGrid(x) : x,
					y: image.snapToGrid ? snapToGrid(y) : y,
				});
			},
			[
				drawer.x,
				drawer.y,
				effectiveEditable,
				image._id,
				image.snapToGrid,
				onUpdate,
			],
		);

		const handleTransformEnd = useCallback(() => {
			if (!effectiveEditable || !groupRef.current) return;
			const node = groupRef.current;
			const scaleX = node.scaleX();
			const scaleY = node.scaleY();
			node.scaleX(1);
			node.scaleY(1);

			const x = node.x() - drawer.x;
			const y = node.y() - drawer.y;
			const rawW = Math.max(20, image.width * scaleX);
			const rawH = Math.max(20, image.height * scaleY);
			const width = image.snapToGrid
				? Math.max(GRID_SIZE, snapToGrid(rawW))
				: rawW;
			const height = image.snapToGrid
				? Math.max(GRID_SIZE, snapToGrid(rawH))
				: rawH;
			onUpdate(image._id, {
				x: image.snapToGrid ? snapToGrid(x) : x,
				y: image.snapToGrid ? snapToGrid(y) : y,
				width,
				height,
			});
		}, [
			drawer.x,
			drawer.y,
			effectiveEditable,
			image._id,
			image.height,
			image.snapToGrid,
			image.width,
			onUpdate,
		]);

		return (
			<>
				<Group
					x={absX}
					y={absY}
					draggable={effectiveEditable}
					onClick={(e) => {
						e.cancelBubble = true;
						if ("button" in e.evt && e.evt.button !== 0) return;
						onSelect(image._id);
					}}
					onTap={(e) => {
						e.cancelBubble = true;
						onSelect(image._id);
					}}
					onDragEnd={handleDragEnd}
					onTransformEnd={handleTransformEnd}
					ref={groupRef}
				>
					{img ? (
						<KonvaImage
							image={img}
							x={-image.width / 2}
							y={-image.height / 2}
							width={image.width}
							height={image.height}
							opacity={0.8}
							perfectDrawEnabled={false}
						/>
					) : (
						<Rect
							x={-image.width / 2}
							y={-image.height / 2}
							width={image.width}
							height={image.height}
							fill="rgba(148,163,184,0.25)"
							stroke="rgba(100,116,139,0.8)"
							strokeWidth={1}
							dash={[6, 4]}
							perfectDrawEnabled={false}
						/>
					)}

					{image.locked && (
						<Rect
							x={-image.width / 2}
							y={-image.height / 2}
							width={image.width}
							height={image.height}
							stroke="rgba(245,158,11,0.9)"
							strokeWidth={2}
							dash={[8, 4]}
							listening={false}
							perfectDrawEnabled={false}
						/>
					)}
				</Group>
				{isSelected && effectiveEditable && (
					<Transformer
						ref={transformerRef}
						nodes={groupRef.current ? [groupRef.current] : []}
						enabledAnchors={[
							"top-left",
							"top-right",
							"bottom-left",
							"bottom-right",
						]}
						rotateEnabled={false}
						flipEnabled={false}
						boundBoxFunc={(oldBox, newBox) => {
							if (newBox.width < 20 || newBox.height < 20) return oldBox;
							return newBox;
						}}
					/>
				)}
			</>
		);
	},
);
