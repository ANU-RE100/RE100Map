import { TerriaPluginModule } from "terriajs-plugin-api";

/**
 * A function that when called imports all plugins.
 */
const plugins: () => Promise<TerriaPluginModule>[] = () => [
  import("./lib/Plugins/DynamicWmsPlugin") as Promise<TerriaPluginModule>
];

export default plugins;
