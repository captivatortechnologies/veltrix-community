// List of Splunk capabilities
export const splunkCapabilities = [
  // Admin capabilities
  'admin_all_objects',
  'change_authentication',
  'license_edit',
  'restart_splunkd',
  'edit_server',
  'edit_user',
  'edit_roles',
  'edit_tokens_settings',
  
  // Search and reporting capabilities
  'search',
  'scheduledsearch',
  'rtsearch',
  'accelerate_datamodel',
  'accelerate_search',
  'pattern_detect',
  'edit_search_scheduler',
  'edit_search_server',
  
  // Data management capabilities
  'edit_forwarders',
  'edit_indexers',
  'edit_inputs',
  'edit_deployment_client',
  'edit_deployment_server',
  'edit_distsearch',
  'edit_dist_peer',
  'edit_tcp_outputs',
  'edit_tcp_stream',
  'edit_splunktcp_token',
  'edit_metrics_rollup',
  'edit_watchdog',
  'list_forwarders',
  
  // Knowledge management capabilities
  'edit_tag',
  'edit_tags_all',
  'edit_field_extraction',
  'edit_props_extraction',
  'edit_field_alias_extraction',
  'edit_transforms_extraction',
  'edit_lookups',
  'edit_sourcetypes',
  'edit_events',
  'edit_web_settings',
  'edit_monitor',
  'edit_modinput_wmi',
  'edit_modinput_network',
  
  // View capabilities
  'list_search_head_clustering',
  'list_indexer_clustering',
  'list_metrics_catalog',
  'list_settings',
  'list_inputs',
  'list_storage_passwords',
  'list_tokens_all',
  'list_tokens',
  'output_file',
  'rest_apps_view',
  'rest_apps_management',
  'rest_properties_get',
  'rest_properties_set',
  'use_file_operator',
  
  // Inference capabilities
  'run_anomaly_detection',
  'run_predict',
  'track_alert',
  'schedule_rtsearch',
  'schedule_search',
  
  // Special capabilities
  '*' // All capabilities
];

export default splunkCapabilities;
