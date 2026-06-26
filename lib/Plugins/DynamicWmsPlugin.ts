import { reaction } from "mobx";
import { JulianDate } from "@cesium/engine";
import CommonStrata from "terriajs/lib/Models/Definition/CommonStrata";
import WebMapServiceCatalogItem from "terriajs/lib/Models/Catalog/Ows/WebMapServiceCatalogItem";
import type { TerriaPluginContext } from "terriajs-plugin-api";

const DYNAMIC_WMS_ID = "__re100_dynamic_wms__";

export default {
  name: "DynamicWms",
  description:
    "Loads a WMS layer into the workbench when a feature with a wms_url attribute is clicked, and removes it when another feature (without wms_url) is clicked.",
  version: "1.0.0",

  register(ctx: TerriaPluginContext) {
    const { terria } = ctx;
    let currentItem: WebMapServiceCatalogItem | undefined;

    function removeCurrent() {
      if (currentItem && terria.workbench.contains(currentItem)) {
        terria.workbench.remove(currentItem);
      }
    }

    reaction(
      () => terria.pickedFeatures,
      async (pickedFeatures) => {
        if (!pickedFeatures) {
          removeCurrent();
          return;
        }

        await pickedFeatures.allFeaturesAvailablePromise;

        // Guard against a newer click having already replaced pickedFeatures
        if (terria.pickedFeatures !== pickedFeatures) return;

        const now = JulianDate.now();
        const matchedFeature = pickedFeatures.features.find(
          (f) => f.properties?.getValue(now)?.wms_url
        );

        if (!matchedFeature) {
          removeCurrent();
          return;
        }

        const props = matchedFeature.properties!.getValue(now);
        const wmsUrl: string = props.wms_url;
        const wmsLayer: string = props.wms_layer ?? "";
        const wmsName: string = props.wms_name ?? "Feature Layer";

        removeCurrent();

        if (!currentItem) {
          currentItem = new WebMapServiceCatalogItem(DYNAMIC_WMS_ID, terria);
        }
        currentItem.setTrait(CommonStrata.user, "url", wmsUrl);
        currentItem.setTrait(CommonStrata.user, "layers", wmsLayer);
        currentItem.setTrait(CommonStrata.user, "name", wmsName);

        await terria.workbench.add(currentItem);
      }
    );
  }
};
