#include <pebble.h>

#define COMMAND_HORIZON_DATA 1
#define COMMAND_PEAKS_DATA 2
#define COMMAND_SETTINGS_DATA 3
#define COMMAND_REQUEST_UPDATE 4

#define HORIZON_SIZE 360
#define HORIZON_WINDOW_DEG 100
#define HORIZON_WINDOW_MIN_DEG 30
#define HORIZON_WINDOW_MAX_DEG 360
#define HEADING_STEP_DEG 10
#define BUTTON_REPEAT_MS 200
#define HEADER_HEIGHT 20
#define CARDINAL_LABEL_HEIGHT 20
#define CARDINAL_TICK_HEIGHT 10
// Platform-specific sizing: aplite has limited memory
#ifdef PBL_PLATFORM_APLITE
#define PEAKS_BUFFER_SIZE 2048
#else
#define PEAKS_BUFFER_SIZE 4096
#endif
#define MAX_PEAKS 96
#define PEAK_NAME_MAX_LEN 28
#define PEAK_LABEL_WIDTH 70
#define PEAK_LABEL_HEIGHT 12
#define PEAK_MIN_SPACING_PX 6
#define PEAK_LABEL_ROWS 3
#define MIN_PEAK_LABEL_CHARS 13
#define HORIZON_HEIGHT_PERCENT 36
#define COMPASS_SMOOTH_NUM 1
#define COMPASS_SMOOTH_DEN 4
#define COMPASS_DEADBAND_DEG 2

typedef enum
{
    HEADING_MODE_COMPASS = 0,
    HEADING_MODE_BUTTON = 1,
} HeadingMode;

typedef struct
{
    int azimuth_deg;
    char name[PEAK_NAME_MAX_LEN];
} Peak;

typedef struct
{
    int x;
    int y;
    int label_x;
    int priority;
    int abs_delta;
    int row;
    char label[PEAK_NAME_MAX_LEN + 4];
} VisiblePeak;

static Window *s_main_window;
static TextLayer *s_heading_layer;
static Layer *s_horizon_layer;

static int s_heading_deg = 0;
static uint8_t s_horizon_data[HORIZON_SIZE];
static bool s_horizon_ready = false;
static char s_peaks_data[PEAKS_BUFFER_SIZE];
static bool s_peaks_ready = false;
static int s_peak_count = 0;
static Peak s_peaks[MAX_PEAKS];
static HeadingMode s_heading_mode = HEADING_MODE_COMPASS;
static bool s_show_header = true;
static bool s_show_cardinals = true;
static bool s_show_peaks = true;
static int s_horizon_window_deg = HORIZON_WINDOW_DEG;
static int s_compass_smooth_heading_deg = 0;
static bool s_compass_smooth_initialized = false;

// Keep peak-layout scratch buffers out of the draw-call stack to avoid stack overflow.
static VisiblePeak s_visible_peaks[MAX_PEAKS];
static VisiblePeak s_placed_peaks[MAX_PEAKS];
static int s_row_starts[PEAK_LABEL_ROWS][MAX_PEAKS];
static int s_row_ends[PEAK_LABEL_ROWS][MAX_PEAKS];
static int s_row_counts[PEAK_LABEL_ROWS];

static int normalize_heading(int heading_deg)
{
    int normalized = heading_deg % HORIZON_SIZE;
    if (normalized < 0)
    {
        normalized += HORIZON_SIZE;
    }

    return normalized;
}

static int signed_heading_delta(int from_heading, int to_heading)
{
    int delta = to_heading - from_heading;
    while (delta < -180)
    {
        delta += 360;
    }
    while (delta > 180)
    {
        delta -= 360;
    }
    return delta;
}

static int abs_int(int value)
{
    return value < 0 ? -value : value;
}

static int clamp_horizon_window_deg(int value)
{
    if (value < HORIZON_WINDOW_MIN_DEG)
    {
        return HORIZON_WINDOW_MIN_DEG;
    }

    if (value > HORIZON_WINDOW_MAX_DEG)
    {
        return HORIZON_WINDOW_MAX_DEG;
    }

    return value;
}

static bool labels_overlap_with_spacing(int left_a, int right_a, int left_b, int right_b, int spacing)
{
    if (right_a + spacing < left_b)
    {
        return false;
    }
    if (right_b + spacing < left_a)
    {
        return false;
    }
    return true;
}

static int parse_azimuth_deg(const char *text)
{
    if (!text)
    {
        return 0;
    }

    int value = 0;
    int first_fraction_digit = -1;
    bool after_decimal = false;

    for (const char *p = text; *p != '\0'; ++p)
    {
        if (*p >= '0' && *p <= '9')
        {
            if (!after_decimal)
            {
                value = value * 10 + (*p - '0');
            }
            else if (first_fraction_digit < 0)
            {
                first_fraction_digit = *p - '0';
                break;
            }
        }
        else if (*p == '.')
        {
            after_decimal = true;
        }
        else if (value > 0 || after_decimal)
        {
            break;
        }
    }

    if (first_fraction_digit >= 5)
    {
        value += 1;
    }

    return normalize_heading(value);
}

static void format_peak_label(const char *name, char *out, size_t out_size)
{
    if (!name || !out || out_size == 0)
    {
        return;
    }

    size_t len = strlen(name);
    if (len <= MIN_PEAK_LABEL_CHARS)
    {
        strncpy(out, name, out_size - 1);
        out[out_size - 1] = '\0';
        return;
    }

    size_t keep = MIN_PEAK_LABEL_CHARS;
    if (keep > out_size - 4)
    {
        keep = out_size - 4;
    }

    memcpy(out, name, keep);
    out[keep] = '\0';
    strcat(out, "...");
}

static void apply_layout(void)
{
    if (!s_main_window || !s_heading_layer || !s_horizon_layer)
    {
        return;
    }

    Layer *window_layer = window_get_root_layer(s_main_window);
    GRect bounds = layer_get_bounds(window_layer);
    int header_height = s_show_header ? HEADER_HEIGHT : 0;

    layer_set_hidden(text_layer_get_layer(s_heading_layer), !s_show_header);
    layer_set_frame(text_layer_get_layer(s_heading_layer), GRect(0, 0, bounds.size.w, HEADER_HEIGHT));
    layer_set_frame(s_horizon_layer, GRect(0, header_height, bounds.size.w, bounds.size.h - header_height));
}

static void refresh_horizon(void)
{
    layer_mark_dirty(s_horizon_layer);
}

static void update_heading_text(void)
{
    static char buffer[40];
    const char *mode_label = s_heading_mode == HEADING_MODE_BUTTON ? "BTN" : "CMP";
    char peaks_flag = s_peaks_ready ? 'P' : '-';
    snprintf(buffer, sizeof(buffer), "%s %03d° %c", mode_label, s_heading_deg, peaks_flag);
    text_layer_set_text(s_heading_layer, buffer);
}

static void store_horizon_data(const uint8_t *data, size_t length)
{
    int copy_len = (length < HORIZON_SIZE) ? length : HORIZON_SIZE;
    memcpy(s_horizon_data, data, copy_len);

    for (int i = copy_len; i < HORIZON_SIZE; ++i)
    {
        s_horizon_data[i] = 0;
    }

    s_horizon_ready = (copy_len > 0);
}

static void store_peaks_data(const char *peaks_text)
{
    if (!peaks_text)
    {
        return;
    }

    strncpy(s_peaks_data, peaks_text, sizeof(s_peaks_data) - 1);
    s_peaks_data[sizeof(s_peaks_data) - 1] = '\0';

    s_peak_count = 0;
    char *line = s_peaks_data;
    while (line && *line != '\0' && s_peak_count < MAX_PEAKS)
    {
        char *newline = strchr(line, '\n');
        if (newline)
        {
            *newline = '\0';
        }

        if (*line != '\0')
        {
            char *sep = strchr(line, '|');
            if (sep)
            {
                *sep = '\0';
                char *name = sep + 1;

                s_peaks[s_peak_count].azimuth_deg = parse_azimuth_deg(line);

                strncpy(s_peaks[s_peak_count].name, name, PEAK_NAME_MAX_LEN - 1);
                s_peaks[s_peak_count].name[PEAK_NAME_MAX_LEN - 1] = '\0';
                s_peak_count += 1;
            }
        }

        line = newline ? (newline + 1) : NULL;
    }

    s_peaks_ready = (s_peak_count > 0);
    APP_LOG(APP_LOG_LEVEL_INFO, "Received peaks: %d", s_peak_count);
}

static void draw_peaks_overlay(GContext *ctx, GRect bounds, int plot_top, int plot_height, int base_y)
{
    (void)plot_top;

    if (!s_show_peaks || !s_peaks_ready || s_peak_count <= 0)
    {
        return;
    }

    int half_window = s_horizon_window_deg / 2;
    int width = bounds.size.w;
    GFont font = fonts_get_system_font(FONT_KEY_GOTHIC_09);
    int labels_top = CARDINAL_LABEL_HEIGHT + CARDINAL_TICK_HEIGHT + 2;
    int row_y[PEAK_LABEL_ROWS];
    for (int row = 0; row < PEAK_LABEL_ROWS; ++row)
    {
        row_y[row] = labels_top + row * PEAK_LABEL_HEIGHT;
    }

    graphics_context_set_stroke_color(ctx, GColorLightGray);
    graphics_context_set_text_color(ctx, GColorWhite);

    int visible_count = 0;
    memset(s_row_counts, 0, sizeof(s_row_counts));

    for (int i = 0; i < s_peak_count; ++i)
    {
        int delta = s_peaks[i].azimuth_deg - s_heading_deg;
        while (delta < -180)
        {
            delta += 360;
        }
        while (delta > 180)
        {
            delta -= 360;
        }

        if (delta < -half_window || delta > half_window)
        {
            continue;
        }

        int x = (delta + half_window) * (width - 1) / s_horizon_window_deg;
        int sample = s_horizon_data[s_peaks[i].azimuth_deg];
        int y = base_y - (sample * plot_height / 255);

        int label_x = x - (PEAK_LABEL_WIDTH / 2);
        if (label_x < 0)
        {
            label_x = 0;
        }
        if (label_x + PEAK_LABEL_WIDTH > width)
        {
            label_x = width - PEAK_LABEL_WIDTH;
        }

        if (visible_count >= MAX_PEAKS)
        {
            continue;
        }

        VisiblePeak *peak = &s_visible_peaks[visible_count];
        peak->x = x;
        peak->y = y;
        peak->label_x = label_x;
        peak->priority = sample;
        peak->abs_delta = abs_int(delta);
        peak->row = -1;
        format_peak_label(s_peaks[i].name, peak->label, sizeof(peak->label));
        visible_count += 1;
    }

    // Prefer dominant/taller peaks first; use center proximity as tie-breaker.
    for (int i = 1; i < visible_count; ++i)
    {
        VisiblePeak key = s_visible_peaks[i];
        int j = i - 1;
        while (j >= 0)
        {
            bool should_shift = false;
            if (s_visible_peaks[j].priority < key.priority)
            {
                should_shift = true;
            }
            else if (s_visible_peaks[j].priority == key.priority && s_visible_peaks[j].abs_delta > key.abs_delta)
            {
                should_shift = true;
            }

            if (!should_shift)
            {
                break;
            }

            s_visible_peaks[j + 1] = s_visible_peaks[j];
            j -= 1;
        }
        s_visible_peaks[j + 1] = key;
    }

    int placed_count = 0;

    for (int i = 0; i < visible_count; ++i)
    {
        int left = s_visible_peaks[i].label_x;
        int right = left + PEAK_LABEL_WIDTH;
        int chosen_row = -1;

        for (int row = 0; row < PEAK_LABEL_ROWS; ++row)
        {
            bool overlaps = false;
            for (int k = 0; k < s_row_counts[row]; ++k)
            {
                if (labels_overlap_with_spacing(left, right, s_row_starts[row][k], s_row_ends[row][k], PEAK_MIN_SPACING_PX))
                {
                    overlaps = true;
                    break;
                }
            }

            if (!overlaps)
            {
                chosen_row = row;
                break;
            }
        }

        if (chosen_row < 0)
        {
            continue;
        }

        s_visible_peaks[i].row = chosen_row;
        s_row_starts[chosen_row][s_row_counts[chosen_row]] = left;
        s_row_ends[chosen_row][s_row_counts[chosen_row]] = right;
        s_row_counts[chosen_row] += 1;

        s_placed_peaks[placed_count] = s_visible_peaks[i];
        placed_count += 1;
    }

    // Draw left-to-right for visual stability as heading moves.
    for (int i = 1; i < placed_count; ++i)
    {
        VisiblePeak key = s_placed_peaks[i];
        int j = i - 1;
        while (j >= 0 && s_placed_peaks[j].x > key.x)
        {
            s_placed_peaks[j + 1] = s_placed_peaks[j];
            j -= 1;
        }
        s_placed_peaks[j + 1] = key;
    }

    for (int i = 0; i < placed_count; ++i)
    {
        int label_y = row_y[s_placed_peaks[i].row];
        int line_start_y = label_y + PEAK_LABEL_HEIGHT;
        int line_end_y = s_placed_peaks[i].y - 2;

        if (line_end_y > line_start_y)
        {
            graphics_draw_line(ctx, GPoint(s_placed_peaks[i].x, line_start_y), GPoint(s_placed_peaks[i].x, line_end_y));
        }

        graphics_draw_text(
            ctx,
            s_placed_peaks[i].label,
            font,
            GRect(s_placed_peaks[i].label_x, label_y, PEAK_LABEL_WIDTH, PEAK_LABEL_HEIGHT),
            GTextOverflowModeFill,
            GTextAlignmentCenter,
            NULL);
    }
}

static void draw_cardinal_labels(GContext *ctx, GRect bounds)
{
    if (!s_show_cardinals)
    {
        return;
    }

    static const struct
    {
        int heading;
        const char *label;
    } cardinal_points[] = {
        {0, "N"},
        {90, "E"},
        {180, "S"},
        {270, "W"},
    };

    int half_window = s_horizon_window_deg / 2;
    GFont font = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
    graphics_context_set_text_color(ctx, GColorWhite);
    graphics_context_set_stroke_color(ctx, GColorLightGray);

    for (size_t i = 0; i < ARRAY_LENGTH(cardinal_points); ++i)
    {
        int delta = cardinal_points[i].heading - s_heading_deg;
        while (delta < -180)
        {
            delta += 360;
        }
        while (delta > 180)
        {
            delta -= 360;
        }

        if (delta < -half_window || delta > half_window)
        {
            continue;
        }

        int x = (delta + half_window) * (bounds.size.w - 1) / s_horizon_window_deg;
        graphics_draw_text(
            ctx,
            cardinal_points[i].label,
            font,
            GRect(x - 10, 0, 20, 14),
            GTextOverflowModeWordWrap,
            GTextAlignmentCenter,
            NULL);
    }

    // draw ticks all 15 degrees in different height (cardinal points highest NE/SW/.. little lower and in between lowest)
    for (int absolute_heading = 0; absolute_heading < 360; absolute_heading += 15)
    {
        int delta = absolute_heading - s_heading_deg;
        while (delta < -180)
            delta += 360;
        while (delta > 180)
            delta -= 360;

        if (delta < -half_window || delta > half_window)
        {
            continue;
        }

        int real_x = (delta + half_window) * (bounds.size.w - 1) / s_horizon_window_deg;
        int tick_height = (absolute_heading % 90 == 0) ? CARDINAL_TICK_HEIGHT : ((absolute_heading % 45 == 0) ? 7 : 4);
        graphics_draw_line(ctx, GPoint(real_x, CARDINAL_LABEL_HEIGHT), GPoint(real_x, CARDINAL_LABEL_HEIGHT + tick_height));
    }
}

static void horizon_layer_update_proc(Layer *layer, GContext *ctx)
{
    GRect bounds = layer_get_bounds(layer);

    graphics_context_set_fill_color(ctx, GColorBlack);
    graphics_fill_rect(ctx, bounds, 0, GCornerNone);

    draw_cardinal_labels(ctx, bounds);

    if (!s_horizon_ready)
    {
        return;
    }

    int width = bounds.size.w;
    int height = bounds.size.h;
    int plot_height = (height * HORIZON_HEIGHT_PERCENT) / 100;
    int min_plot_height = 20;
    if (plot_height < min_plot_height)
    {
        plot_height = min_plot_height;
    }
    int max_plot_height = height - (CARDINAL_LABEL_HEIGHT + CARDINAL_TICK_HEIGHT + (PEAK_LABEL_ROWS * PEAK_LABEL_HEIGHT) + 4);
    if (plot_height > max_plot_height)
    {
        plot_height = max_plot_height;
    }

    int base_y = height - 1;
    int plot_top = base_y - plot_height;

    if (width < 2 || plot_height < 1)
    {
        return;
    }

    graphics_context_set_stroke_color(ctx, GColorWhite);

    int prev_x = 0;
    int prev_offset = -s_horizon_window_deg / 2;
    int prev_sample = s_horizon_data[normalize_heading(s_heading_deg + prev_offset)];
    int prev_y = base_y - (prev_sample * plot_height / 255);

    for (int x = 1; x < width; ++x)
    {
        int offset = -s_horizon_window_deg / 2 + (x * s_horizon_window_deg) / (width - 1);
        int sample = s_horizon_data[normalize_heading(s_heading_deg + offset)];
        int y = base_y - (sample * plot_height / 255);

        graphics_draw_line(ctx, GPoint(prev_x, prev_y), GPoint(x, y));

        prev_x = x;
        prev_y = y;
    }

    draw_peaks_overlay(ctx, bounds, plot_top, plot_height, base_y);
}

static void inbox_received_handler(DictionaryIterator *iter, void *context)
{
    Tuple *command_t = dict_find(iter, MESSAGE_KEY_command);
    if (!command_t)
    {
        return;
    }

    if (command_t->value->int32 == COMMAND_HORIZON_DATA)
    {
        Tuple *data_tuple = dict_find(iter, MESSAGE_KEY_horizonData);
        if (data_tuple && data_tuple->type == TUPLE_BYTE_ARRAY && data_tuple->length > 0)
        {
            store_horizon_data(data_tuple->value->data, data_tuple->length);
            layer_mark_dirty(s_horizon_layer);
        }
    }
    else if (command_t->value->int32 == COMMAND_PEAKS_DATA)
    {
        Tuple *peaks_tuple = dict_find(iter, MESSAGE_KEY_peaksData);
        if (peaks_tuple && peaks_tuple->type == TUPLE_CSTRING)
        {
            store_peaks_data(peaks_tuple->value->cstring);
            update_heading_text();
        }
    }
    else if (command_t->value->int32 == COMMAND_SETTINGS_DATA)
    {
        bool layout_changed = false;
        bool redraw_needed = false;

        Tuple *show_header_tuple = dict_find(iter, MESSAGE_KEY_showHeader);
        if (show_header_tuple)
        {
            s_show_header = show_header_tuple->value->int32 != 0;
            layout_changed = true;
        }

        Tuple *show_cardinals_tuple = dict_find(iter, MESSAGE_KEY_showCardinals);
        if (show_cardinals_tuple)
        {
            s_show_cardinals = show_cardinals_tuple->value->int32 != 0;
            layout_changed = true;
        }

        Tuple *show_peaks_tuple = dict_find(iter, MESSAGE_KEY_showPeaks);
        if (show_peaks_tuple)
        {
            s_show_peaks = show_peaks_tuple->value->int32 != 0;
            layout_changed = true;
        }

        Tuple *horizon_window_tuple = dict_find(iter, MESSAGE_KEY_horizonWindowDeg);
        if (horizon_window_tuple)
        {
            s_horizon_window_deg = clamp_horizon_window_deg((int)horizon_window_tuple->value->int32);
            redraw_needed = true;
        }

        if (layout_changed)
        {
            apply_layout();
            update_heading_text();
            redraw_needed = true;
        }

        if (redraw_needed)
        {
            refresh_horizon();
        }
    }
    else
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "Unknown command: %d", (int)command_t->value->int32);
    }
}

static void inbox_dropped_handler(AppMessageResult reason, void *context)
{
    APP_LOG(APP_LOG_LEVEL_ERROR, "Inbox dropped: %d", reason);
}

static void outbox_failed_handler(DictionaryIterator *iter, AppMessageResult reason, void *context)
{
    APP_LOG(APP_LOG_LEVEL_ERROR, "Outbox failed: %d", reason);
}

static void compass_handler(CompassHeadingData heading_data)
{
    if (s_heading_mode != HEADING_MODE_COMPASS)
    {
        return;
    }

    if (heading_data.compass_status == CompassStatusDataInvalid)
    {
        return;
    }

    int raw_heading = normalize_heading(TRIGANGLE_TO_DEG(TRIG_MAX_ANGLE - heading_data.true_heading));

    if (!s_compass_smooth_initialized)
    {
        s_compass_smooth_heading_deg = raw_heading;
        s_compass_smooth_initialized = true;
    }

    int delta = signed_heading_delta(s_compass_smooth_heading_deg, raw_heading);
    if (abs_int(delta) < COMPASS_DEADBAND_DEG)
    {
        return;
    }

    int step = (delta * COMPASS_SMOOTH_NUM) / COMPASS_SMOOTH_DEN;
    if (step == 0)
    {
        step = delta > 0 ? 1 : -1;
    }

    int new_heading = normalize_heading(s_compass_smooth_heading_deg + step);
    s_compass_smooth_heading_deg = new_heading;

    if (new_heading == s_heading_deg)
    {
        return;
    }

    s_heading_deg = new_heading;
    update_heading_text();
    refresh_horizon();
}

static void apply_manual_heading_delta(int delta)
{
    if (s_heading_mode != HEADING_MODE_BUTTON)
    {
        s_heading_mode = HEADING_MODE_BUTTON;
    }

    s_heading_deg = normalize_heading(s_heading_deg + delta);
    update_heading_text();
    refresh_horizon();
}

static void up_click_handler(ClickRecognizerRef recognizer, void *context)
{
    apply_manual_heading_delta(-HEADING_STEP_DEG);
}

static void down_click_handler(ClickRecognizerRef recognizer, void *context)
{
    apply_manual_heading_delta(HEADING_STEP_DEG);
}

static void select_single_click_handler(ClickRecognizerRef recognizer, void *context)
{
    DictionaryIterator *iter;
    if (app_message_outbox_begin(&iter) == APP_MSG_OK)
    {
        dict_write_uint8(iter, MESSAGE_KEY_command, COMMAND_REQUEST_UPDATE);
        app_message_outbox_send();
    }
}

static void select_long_click_handler(ClickRecognizerRef recognizer, void *context)
{
    s_heading_mode = s_heading_mode == HEADING_MODE_COMPASS ? HEADING_MODE_BUTTON : HEADING_MODE_COMPASS;

    if (s_heading_mode == HEADING_MODE_COMPASS)
    {
        // Resume compass mode from current heading to avoid a visible jump.
        s_compass_smooth_heading_deg = s_heading_deg;
        s_compass_smooth_initialized = true;
    }

    update_heading_text();
    refresh_horizon();
}

static void click_config_provider(void *context)
{
    window_single_repeating_click_subscribe(BUTTON_ID_UP, BUTTON_REPEAT_MS, up_click_handler);
    window_single_click_subscribe(BUTTON_ID_SELECT, select_single_click_handler);
    window_long_click_subscribe(BUTTON_ID_SELECT, 500, select_long_click_handler, NULL);
    window_single_repeating_click_subscribe(BUTTON_ID_DOWN, BUTTON_REPEAT_MS, down_click_handler);
}

static void main_window_load(Window *window)
{
    Layer *window_layer = window_get_root_layer(window);
    GRect bounds = layer_get_bounds(window_layer);

    s_heading_layer = text_layer_create(GRect(0, 0, bounds.size.w, HEADER_HEIGHT));
    text_layer_set_background_color(s_heading_layer, GColorBlack);
    text_layer_set_text_color(s_heading_layer, GColorWhite);
    text_layer_set_font(s_heading_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
    text_layer_set_text_alignment(s_heading_layer, GTextAlignmentCenter);
    layer_add_child(window_layer, text_layer_get_layer(s_heading_layer));

    s_horizon_layer = layer_create(GRect(0, HEADER_HEIGHT, bounds.size.w, bounds.size.h - HEADER_HEIGHT));
    layer_set_update_proc(s_horizon_layer, horizon_layer_update_proc);
    layer_add_child(window_layer, s_horizon_layer);

    apply_layout();
    update_heading_text();
}

static void main_window_unload(Window *window)
{
    layer_destroy(s_horizon_layer);
    text_layer_destroy(s_heading_layer);
}

static void init(void)
{
    s_main_window = window_create();
    window_set_background_color(s_main_window, GColorBlack);
    window_set_click_config_provider(s_main_window, click_config_provider);
    window_set_window_handlers(s_main_window, (WindowHandlers){
                                                  .load = main_window_load,
                                                  .unload = main_window_unload,
                                              });
    window_stack_push(s_main_window, true);

    app_message_register_inbox_received(inbox_received_handler);
    app_message_register_inbox_dropped(inbox_dropped_handler);
    app_message_register_outbox_failed(outbox_failed_handler);
    app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());

    compass_service_subscribe(compass_handler);
    compass_service_set_heading_filter(TRIG_MAX_ANGLE / 180);
}

static void deinit(void)
{
    compass_service_unsubscribe();
    window_destroy(s_main_window);
}

int main(void)
{
    init();
    app_event_loop();
    deinit();
}
