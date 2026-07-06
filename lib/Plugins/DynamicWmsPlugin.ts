import { reaction } from "mobx";
import JulianDate from "terriajs-cesium/Source/Core/JulianDate";
import TerriaError from "terriajs/lib/Core/TerriaError";
import { featureBelongsToCatalogItem } from "terriajs/lib/Map/PickedFeatures/PickedFeatures";
import WebMapServiceCatalogItem from "terriajs/lib/Models/Catalog/Ows/WebMapServiceCatalogItem";
import CommonStrata from "terriajs/lib/Models/Definition/CommonStrata";
import type { TerriaPluginContext } from "terriajs-plugin-api";

const DYNAMIC_WMS_ID = "__re100_dynamic_wms__";

/** Feature attributes that map a clicked feature to a WMS layer. */
const URL_ATTRIBUTE = "wms_url";
const LAYER_ATTRIBUTE = "wms_layer";
const NAME_ATTRIBUTE = "wms_name";

export default {
  name: "DynamicWms",
  description:
    "Loads a WMS layer into the workbench when a feature with a wms_url attribute is clicked. Clicking a different feature swaps the WMS layer; clicking elsewhere removes it.",
  version: "1.0.0",

  register(ctx: TerriaPluginContext) {
    const { terria } = ctx;
    let currentItem: WebMapServiceCatalogItem | undefined;
    // Incremented on every click so slow async work from an older click can
    // detect it has been superseded and bail out.
    let clickSeq = 0;

    function removeCurrent() {
      if (currentItem && terria.workbench.contains(currentItem)) {
        terria.workbench.remove(currentItem);
      }
    }

    async function onPickedFeatures(
      pickedFeatures: typeof terria.pickedFeatures
    ) {
      const seq = ++clickSeq;

      if (!pickedFeatures) {
        // Feature info panel dismissed.
        removeCurrent();
        return;
      }

      // Features from imagery layers (e.g. WMS GetFeatureInfo) arrive
      // asynchronously; wait for all of them before inspecting.
      await pickedFeatures.allFeaturesAvailablePromise;
      if (seq !== clickSeq) return;

      const now = JulianDate.now();
      const matchedFeature = pickedFeatures.features.find(
        (f) => f.properties?.getValue(now)?.[URL_ATTRIBUTE]
      );

      if (!matchedFeature) {
        // Don't remove the dynamic layer when the user is inspecting it -
        // its own features won't carry a wms_url attribute.
        const clickedDynamicLayer =
          currentItem !== undefined &&
          pickedFeatures.features.some((f) =>
            featureBelongsToCatalogItem(f, currentItem!)
          );
        if (!clickedDynamicLayer) {
          removeCurrent();
        }
        return;
      }

      const props = matchedFeature.properties!.getValue(now);
      const wmsUrl: string = String(props[URL_ATTRIBUTE]);
      const wmsLayer: string =
        props[LAYER_ATTRIBUTE] !== undefined
          ? String(props[LAYER_ATTRIBUTE])
          : "";
      const wmsName: string =
        props[NAME_ATTRIBUTE] !== undefined
          ? String(props[NAME_ATTRIBUTE])
          : "Feature Layer";

      if (wmsLayer === "") {
        console.warn(
          `DynamicWms: feature has ${URL_ATTRIBUTE} but no ${LAYER_ATTRIBUTE}; the WMS layer may not load.`
        );
      }

      // Clicking the same feature (or one pointing at the same layer) again
      // shouldn't reload the layer.
      if (
        currentItem &&
        terria.workbench.contains(currentItem) &&
        currentItem.url === wmsUrl &&
        currentItem.layers === wmsLayer
      ) {
        return;
      }

      removeCurrent();

      if (!currentItem) {
        currentItem = new WebMapServiceCatalogItem(DYNAMIC_WMS_ID, terria);
      }
      currentItem.setTrait(CommonStrata.user, "url", wmsUrl);
      currentItem.setTrait(CommonStrata.user, "layers", wmsLayer);
      currentItem.setTrait(CommonStrata.user, "name", wmsName);

      const result = await terria.workbench.add(currentItem);
      if (seq !== clickSeq) {
        // A newer click happened while the layer was loading; that click's
        // handler owns the workbench now.
        return;
      }
      result.raiseError(terria, `Failed to load WMS layer "${wmsName}"`);
    }

    reaction(
      () => terria.pickedFeatures,
      (pickedFeatures) => {
        onPickedFeatures(pickedFeatures).catch((e) => {
          TerriaError.from(e, {
            title: "DynamicWms plugin error"
          }).log();
        });
      }
    );
  }
};
